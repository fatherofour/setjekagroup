import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationType, CommentEntityType } from '../generated/prisma/enums.js';
import type { Notification } from '../generated/prisma/client.js';
import { recordLink } from './links.js';
import { ALERT_CATEGORIES, UNMUTABLE, categoryOf, typesIn, type AlertCategory } from './categories.js';

const DUE_SOON_WINDOW_DAYS = 2;

export interface NotificationFilter {
  category?: AlertCategory;
  unread?: boolean;
  projectId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a notification for a user — a no-op if `userId` is null (e.g. an
   * assignee that's an external contact with no linked platform account), or
   * if they've switched that kind of alert off.
   *
   * `collapse`: when they already have an unread alert of the same kind for
   * the same record, refresh that one instead of stacking another (e.g. ten
   * photos uploaded against one issue are one alert, not ten). */
  async notify(params: {
    userId: string | null | undefined;
    projectId: string | null;
    opportunityId?: string | null;
    type: NotificationType;
    entityType: CommentEntityType;
    entityId: string;
    message: string;
    /** Defaults to the record's page. */
    link?: string;
    collapse?: boolean;
  }) {
    if (!params.userId) return;
    const category = categoryOf(params.type);
    if (!UNMUTABLE.includes(category)) {
      const user = await this.prisma.user.findUnique({ where: { id: params.userId }, select: { mutedAlertCategories: true } });
      if (user?.mutedAlertCategories.includes(category)) return;
    }
    const link = params.link ?? recordLink(params.entityType, { projectId: params.projectId, opportunityId: params.opportunityId, entityId: params.entityId });
    if (params.collapse) {
      const existing = await this.prisma.notification.findFirst({
        where: { userId: params.userId, type: params.type, entityType: params.entityType, entityId: params.entityId, isRead: false },
      });
      if (existing) {
        await this.prisma.notification.update({ where: { id: existing.id }, data: { message: params.message, link, createdAt: new Date() } });
        return;
      }
    }
    await this.prisma.notification.create({
      data: {
        userId: params.userId,
        projectId: params.projectId,
        link,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        message: params.message,
      },
    });
  }

  /** Reminders computed on the fly for the user's assigned tasks, issues,
   * risks, RFIs, submittals and note actions due within the next two days.
   * There is no scheduler anywhere in this app, so "due soon" can't be a
   * background job; computing it at read time is the honest alternative.
   * Anything already alerted (or dismissed) today is skipped. */
  private async dueSoon(userId: string, persisted: Notification[]): Promise<Notification[]> {
    const member = await this.prisma.projectMember.findMany({ where: { userId }, select: { id: true, projectId: true } });
    const dueWindow = new Date();
    dueWindow.setDate(dueWindow.getDate() + DUE_SOON_WINDOW_DAYS);
    const memberIds = member.map((m) => m.id);
    const projectIdByMemberId = new Map(member.map((m) => [m.id, m.projectId]));

    const today = new Date().toDateString();
    const alreadyToday = new Set(
      persisted.filter((n) => n.type === 'DUE_SOON' && n.createdAt.toDateString() === today).map((n) => `${n.entityType}:${n.entityId}`),
    );

    const out: Notification[] = [];
    const push = (key: string, entityType: CommentEntityType, entityId: string, projectId: string | null, message: string, due: Date, link?: string) => {
      if (alreadyToday.has(`${entityType}:${entityId}`)) return;
      out.push({
        id: `synthetic-${key}-${entityId}`,
        userId,
        projectId,
        type: 'DUE_SOON',
        entityType,
        entityId,
        link: link ?? recordLink(entityType, { projectId }),
        message,
        isRead: false,
        createdAt: due,
      });
    };

    if (memberIds.length > 0) {
      const [dueTasks, dueIssues, dueRisks, dueRfis, dueSubmittals] = await Promise.all([
        this.prisma.projectTask.findMany({
          where: { assignedToId: { in: memberIds }, dueDate: { lte: dueWindow, not: null }, status: { not: 'DONE' } },
        }),
        this.prisma.projectIssue.findMany({
          where: { ownerId: { in: memberIds }, dueDate: { lte: dueWindow, not: null }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        }),
        this.prisma.projectRisk.findMany({
          where: { ownerId: { in: memberIds }, reviewDate: { lte: dueWindow, not: null }, status: { not: 'CLOSED' } },
        }),
        // Whoever currently holds the ball is the one who needs the reminder.
        this.prisma.rfi.findMany({
          where: { ballInCourtId: { in: memberIds }, dueDate: { lte: dueWindow, not: null }, status: { not: 'CLOSED' } },
        }),
        this.prisma.submittal.findMany({
          where: {
            reviewerId: { in: memberIds },
            dueDate: { lte: dueWindow, not: null },
            status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED'] },
          },
        }),
      ]);
      const pid = (memberId: string | null) => (memberId ? (projectIdByMemberId.get(memberId) ?? null) : null);
      for (const t of dueTasks) push('task', 'TASK', t.id, pid(t.assignedToId), `Task "${t.title}" is due soon`, t.dueDate!);
      for (const i of dueIssues) push('issue', 'ISSUE', i.id, pid(i.ownerId), `Issue "${i.title}" is due soon`, i.dueDate!);
      for (const r of dueRisks) push('risk', 'RISK', r.id, pid(r.ownerId), `Risk "${r.title}" is due for review`, r.reviewDate!);
      for (const r of dueRfis) push('rfi', 'RFI', r.id, pid(r.ballInCourtId), `RFI "${r.title}" is due soon`, r.dueDate!);
      for (const s of dueSubmittals) push('submittal', 'SUBMITTAL', s.id, pid(s.reviewerId), `Submittal "${s.title}" is due soon`, s.dueDate!);
    }

    // Note actions addressed to this user and due soon (Meeting 3 §2.4).
    // Keyed by the note's own id (not the record it sits on) so two actions
    // on one record are reminded - and dismissed - separately.
    const dueActions = await this.prisma.comment.findMany({
      where: { recipientId: userId, isAction: true, actionStatus: 'OPEN', dueDate: { lte: dueWindow, not: null } },
    });
    for (const a of dueActions) {
      const body = a.body.length > 80 ? `${a.body.slice(0, 77)}…` : a.body;
      push('action', a.entityType, a.id, a.projectId, `Action due soon: "${body}"`, a.dueDate!, recordLink(a.entityType, a));
    }
    return out;
  }

  /** A user's notifications, newest first - stored alerts plus today's due-
   * soon reminders - with the project each belongs to and its category. */
  async findAllForUser(userId: string, filter: NotificationFilter = {}) {
    if (filter.category && !ALERT_CATEGORIES.includes(filter.category)) throw new BadRequestException('Unknown alert category');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mutedAlertCategories: true } });
    // Reminders dismissed today are needed for de-duplication even when the
    // caller asks only for unread ones.
    const [persisted, dismissedToday] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          userId,
          ...(filter.category ? { type: { in: typesIn(filter.category) } } : {}),
          ...(filter.unread ? { isRead: false } : {}),
          ...(filter.projectId ? { projectId: filter.projectId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.notification.findMany({
        where: { userId, type: 'DUE_SOON', createdAt: { gte: new Date(new Date().toDateString()) } },
      }),
    ]);

    const wantsDeadlines = !filter.category || filter.category === 'DEADLINES';
    const deadlinesMuted = user?.mutedAlertCategories.includes('DEADLINES');
    let synthetic = wantsDeadlines && !deadlinesMuted ? await this.dueSoon(userId, dismissedToday) : [];
    if (filter.projectId) synthetic = synthetic.filter((n) => n.projectId === filter.projectId);

    const all = [...synthetic, ...persisted].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const projectIds = [...new Set(all.map((n) => n.projectId).filter((id): id is string => Boolean(id)))];
    const projects = projectIds.length
      ? await this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, projectCode: true } })
      : [];
    const projectById = new Map(projects.map((p) => [p.id, p]));
    return all.map((n) => ({ ...n, category: categoryOf(n.type), project: n.projectId ? (projectById.get(n.projectId) ?? null) : null }));
  }

  /** Reading a due-soon reminder stores it as read for today, so it stops
   * showing as new until tomorrow's reminder. */
  private async dismissSynthetic(userId: string, ids: string[] | 'all') {
    const dismissedToday = await this.prisma.notification.findMany({
      where: { userId, type: 'DUE_SOON', createdAt: { gte: new Date(new Date().toDateString()) } },
    });
    const pending = (await this.dueSoon(userId, dismissedToday)).filter((n) => ids === 'all' || ids.includes(n.id));
    if (pending.length === 0) return;
    await this.prisma.notification.createMany({
      data: pending.map((n) => ({
        userId,
        projectId: n.projectId,
        link: n.link,
        type: 'DUE_SOON' as const,
        entityType: n.entityType,
        entityId: n.entityId,
        message: n.message,
        isRead: true,
      })),
    });
  }

  async markRead(userId: string, id: string) {
    if (id.startsWith('synthetic-')) await this.dismissSynthetic(userId, [id]);
    else await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { id, isRead: true };
  }

  async markUnread(userId: string, id: string) {
    if (id.startsWith('synthetic-')) return { id, isRead: false };
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: false } });
    return { id, isRead: false };
  }

  async markAllRead(userId: string) {
    await this.dismissSynthetic(userId, 'all');
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }

  async preferences(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mutedAlertCategories: true } });
    return ALERT_CATEGORIES.map((category) => ({
      category,
      muted: Boolean(user?.mutedAlertCategories.includes(category)),
      locked: UNMUTABLE.includes(category),
    }));
  }

  async setPreferences(userId: string, muted: string[]) {
    const valid = muted.filter((c): c is AlertCategory => ALERT_CATEGORIES.includes(c as AlertCategory) && !UNMUTABLE.includes(c as AlertCategory));
    await this.prisma.user.update({ where: { id: userId }, data: { mutedAlertCategories: [...new Set(valid)] } });
    return this.preferences(userId);
  }
}
