import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationType, CommentEntityType } from '../generated/prisma/enums.js';
import type { Notification } from '../generated/prisma/client.js';
import { recordLink } from './links.js';
import { MailService } from '../mail/mail.service.js';
import { INCEPTION_DELIVERABLES } from '../inception/procsa.js';
import { ALERT_CATEGORIES, UNMUTABLE, categoryOf, typesIn, type AlertCategory } from './categories.js';
import { STAGE_LABEL } from '../reports/report-data.js';

// App Review, 17 Oct 2026: alert three days ahead.
const DUE_SOON_WINDOW_DAYS = 3;
// Reminders computed at read time; reading one stores a read row of the
// same type for the day.
const REMINDER_TYPES = ['DUE_SOON', 'APPROVAL_DUE', 'APPROVAL_OVERDUE'] as const;
const shortDate = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

export interface NotificationFilter {
  category?: AlertCategory;
  unread?: boolean;
  projectId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** The project's client contacts with a platform login: who a sign-off
   * goes to. */
  clientsOf(projectId: string) {
    return this.prisma.projectMember
      .findMany({ where: { projectId, role: 'CLIENT', userId: { not: null } }, select: { user: { select: { id: true, email: true, fullName: true } } } })
      .then((rows) => rows.flatMap((r) => (r.user ? [r.user] : [])));
  }

  /** Setjeka's people on the project (the PM and DM), and Setjeka's
   * administrators: who hears about a client's decision. */
  async setjekaTeamOf(projectId: string) {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null }, user: { OR: [{ accountType: 'INTERNAL' }, { role: 'ADMIN' }] } },
      select: { user: { select: { id: true, email: true, fullName: true } } },
    });
    return [...new Map(rows.flatMap((r) => (r.user ? [[r.user.id, r.user] as const] : []))).values()];
  }

  /** An in-app alert and the same message by email, for what must reach
   * someone even when they aren't signed in: the client's sign-offs. The
   * in-app alert is not mutable (APPROVALS); the email always goes. */
  async notifyByEmailToo(
    people: { id: string; email: string; fullName: string }[],
    alert: Omit<Parameters<NotificationsService['notify']>[0], 'userId'>,
    email: { subject: string; paragraphs: string[]; action: { label: string; path: string } },
  ) {
    for (const person of people) {
      await this.notify({ ...alert, userId: person.id });
      await this.mail.send({ to: person.email, subject: email.subject, paragraphs: [`Dear ${person.fullName},`, ...email.paragraphs], action: email.action });
    }
  }

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

    // Milestones and stage deliverables (App Review, 17 Oct 2026): on a
    // project, the Development Manager and Project Manager are reminded; on
    // an opportunity (Stage 0), its owner.
    const ownerRoles = member.length
      ? await this.prisma.projectMember.findMany({ where: { userId, role: { in: ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER'] } }, select: { projectId: true } })
      : [];
    const milestones = await this.prisma.developmentMilestone.findMany({
      where: {
        actualDate: null,
        targetDate: { lte: dueWindow, not: null },
        OR: [
          ...(ownerRoles.length ? [{ projectId: { in: ownerRoles.map((r) => r.projectId) } }] : []),
          { projectId: null, opportunity: { ownerId: userId, stage: { not: 'CONVERTED' as const } } },
        ],
      },
    });
    for (const m of milestones) {
      const link = m.projectId ? `/projects/${m.projectId}?tab=overview` : m.opportunityId ? `/opportunities/${m.opportunityId}?tab=milestones` : '/my-day';
      const overdue = m.targetDate! < new Date();
      push('milestone', m.projectId ? 'PROJECT' : 'OPPORTUNITY', m.id, m.projectId, `Milestone "${m.name}" ${overdue ? 'is overdue' : 'is due soon'}`, m.targetDate!, link);
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

  /** Decisions with a response date (App Review, 17 Oct 2026). The client
   * is reminded from three days before the date; whoever sent the item is
   * told once it's overdue. Approvals alerts can't be switched off. */
  private async approvalReminders(userId: string, persisted: Notification[]): Promise<Notification[]> {
    const today = new Date().toDateString();
    const alreadyToday = new Set(
      persisted.filter((n) => (n.type === 'APPROVAL_DUE' || n.type === 'APPROVAL_OVERDUE') && n.createdAt.toDateString() === today).map((n) => `${n.type}:${n.entityId}`),
    );
    const now = new Date();
    const window = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 86_400_000);
    const out: Notification[] = [];
    const push = (type: 'APPROVAL_DUE' | 'APPROVAL_OVERDUE', entityType: CommentEntityType, entityId: string, projectId: string, message: string, due: Date, link: string) => {
      if (alreadyToday.has(`${type}:${entityId}`)) return;
      out.push({ id: `synthetic-${type === 'APPROVAL_DUE' ? 'appdue' : 'appover'}-${entityId}`, userId, projectId, type, entityType, entityId, link, message, isRead: false, createdAt: due });
    };
    const asClient = { project: { members: { some: { userId, role: 'CLIENT' as const } } } };
    const dueSoon = { responseDueAt: { lte: window, not: null } };
    const overdue = { responseDueAt: { lt: now, not: null } };
    const asLead = { project: { members: { some: { userId, role: { in: ['PROJECT_MANAGER' as const, 'DEVELOPMENT_MANAGER' as const] } } } } };
    const warrantyWindow = new Date(now.getTime() + 30 * 86_400_000);
    const [certs, toCertify, toPay, toAssess, periodsEnding, warranties] = await Promise.all([
      this.prisma.valuation.findMany({ where: { status: 'CERTIFIED', ...dueSoon, ...asClient } }),
      this.prisma.valuation.findMany({ where: { status: 'SUBMITTED', certifyDueAt: { lte: window, not: null }, ...asLead } }),
      this.prisma.valuation.findMany({ where: { status: 'APPROVED', payDueAt: { lte: window, not: null }, ...asLead } }),
      this.prisma.timeClaim.findMany({ where: { status: 'SUBMITTED', assessDueAt: { lte: window, not: null }, ...asLead } }),
      this.prisma.projectContract.findMany({ where: { finalCompletionAt: null, defectsPeriodEndsAt: { lte: window, not: null }, ...asLead } }),
      this.prisma.handoverItem.findMany({
        where: { status: { in: ['ACCEPTED', 'HANDED_OVER'] }, expiresAt: { gte: now, lte: warrantyWindow }, OR: [asLead, { status: 'HANDED_OVER', ...asClient }] },
        include: { contract: { select: { title: true } } },
      }),
    ]);
    const [dels, vars, gates, docs, myDels, myVars, myGates, myDocs] = await Promise.all([
      this.prisma.stageDeliverable.findMany({ where: { status: 'SUBMITTED', ...dueSoon, ...asClient } }),
      this.prisma.variation.findMany({ where: { status: 'SUBMITTED', ...dueSoon, ...asClient } }),
      this.prisma.stageTransition.findMany({ where: { status: 'PENDING', ...dueSoon, ...asClient } }),
      this.prisma.documentApprovalRequest.findMany({ where: { status: 'PENDING', ...dueSoon, ...asClient }, include: { revision: { select: { revisionNumber: true, document: { select: { name: true } } } } } }),
      this.prisma.stageDeliverable.findMany({ where: { status: 'SUBMITTED', submittedById: userId, ...overdue } }),
      this.prisma.variation.findMany({ where: { status: 'SUBMITTED', raisedById: userId, ...overdue } }),
      this.prisma.stageTransition.findMany({ where: { status: 'PENDING', requestedById: userId, ...overdue } }),
      this.prisma.documentApprovalRequest.findMany({ where: { status: 'PENDING', requestedById: userId, ...overdue }, include: { revision: { select: { revisionNumber: true, document: { select: { name: true } } } } } }),
    ]);
    const delTitle = (key: string, version: number) => `${INCEPTION_DELIVERABLES.find((d) => d.key === key)?.title ?? key} (v${version})`;
    const yourDecision = (due: Date) => (due < now ? `was due ${shortDate(due)}` : `is due by ${shortDate(due)}`);
    for (const d of dels) push('APPROVAL_DUE', 'STAGE_DELIVERABLE', d.id, d.projectId, `Your decision on ${delTitle(d.key, d.version)} ${yourDecision(d.responseDueAt!)}`, d.responseDueAt!, `/projects/${d.projectId}?tab=inception`);
    for (const v of vars) push('APPROVAL_DUE', 'VARIATION', v.id, v.projectId, `Your decision on variation ${v.number} ${yourDecision(v.responseDueAt!)}`, v.responseDueAt!, `/projects/${v.projectId}?tab=commercial`);
    for (const t of gates) push('APPROVAL_DUE', 'STAGE_TRANSITION', t.id, t.projectId, `Your decision on moving to ${STAGE_LABEL[t.toStage]} ${yourDecision(t.responseDueAt!)}`, t.responseDueAt!, `/projects/${t.projectId}?tab=overview`);
    for (const r of docs) push('APPROVAL_DUE', 'DOCUMENT_REVISION', r.revisionId, r.projectId, `Your approval of ${r.revision.document.name} (Rev ${r.revision.revisionNumber}) ${yourDecision(r.responseDueAt!)}`, r.responseDueAt!, `/projects/${r.projectId}?tab=documents`);
    for (const v of certs) push('APPROVAL_DUE', 'VALUATION', v.id, v.projectId, `Your approval of payment certificate ${v.certificateNumber} ${yourDecision(v.responseDueAt!)}`, v.responseDueAt!, `/projects/${v.projectId}?tab=commercial&ctab=contracts`);
    for (const v of toCertify) push('APPROVAL_DUE', 'VALUATION', v.id, v.projectId, `Valuation ${v.number} ${v.certifyDueAt! < now ? 'was' : 'is'} to be certified by ${shortDate(v.certifyDueAt!)}`, v.certifyDueAt!, `/projects/${v.projectId}?tab=commercial&ctab=contracts`);
    for (const v of toPay) push('APPROVAL_DUE', 'VALUATION', v.id, v.projectId, `Payment certificate ${v.certificateNumber} ${v.payDueAt! < now ? 'was' : 'is'} to be paid by ${shortDate(v.payDueAt!)}`, v.payDueAt!, `/projects/${v.projectId}?tab=commercial&ctab=contracts`);
    for (const c of toAssess) push('APPROVAL_DUE', 'TIME_CLAIM', c.id, c.projectId, `Extension-of-time claim ${c.number} ${c.assessDueAt! < now ? 'was' : 'is'} to be assessed by ${shortDate(c.assessDueAt!)}`, c.assessDueAt!, `/projects/${c.projectId}?tab=eot&claim=${c.id}`);
    for (const c of periodsEnding) push('APPROVAL_DUE', 'CONTRACT_DEFECT', c.id, c.projectId, `The defects period on ${c.title} ${c.defectsPeriodEndsAt! < now ? 'ended' : 'ends'} ${shortDate(c.defectsPeriodEndsAt!)}: inspect, list the last defects and certify final completion`, c.defectsPeriodEndsAt!, `/projects/${c.projectId}?tab=defects&defect=${c.id}`);
    for (const h of warranties) push('APPROVAL_DUE', 'HANDOVER_ITEM', h.id, h.projectId, `${h.title} on ${h.contract.title} runs out ${shortDate(h.expiresAt!)}`, h.expiresAt!, `/projects/${h.projectId}?tab=handover&item=${h.id}`);
    const late = (what: string, due: Date) => `The client hasn't responded to ${what} (due ${shortDate(due)})`;
    for (const d of myDels) push('APPROVAL_OVERDUE', 'STAGE_DELIVERABLE', d.id, d.projectId, late(delTitle(d.key, d.version), d.responseDueAt!), d.responseDueAt!, `/projects/${d.projectId}?tab=inception`);
    for (const v of myVars) push('APPROVAL_OVERDUE', 'VARIATION', v.id, v.projectId, late(`variation ${v.number}`, v.responseDueAt!), v.responseDueAt!, `/projects/${v.projectId}?tab=commercial`);
    for (const t of myGates) push('APPROVAL_OVERDUE', 'STAGE_TRANSITION', t.id, t.projectId, late(`the move to ${STAGE_LABEL[t.toStage]}`, t.responseDueAt!), t.responseDueAt!, `/projects/${t.projectId}?tab=overview`);
    for (const r of myDocs) push('APPROVAL_OVERDUE', 'DOCUMENT_REVISION', r.revisionId, r.projectId, late(`${r.revision.document.name} (Rev ${r.revision.revisionNumber})`, r.responseDueAt!), r.responseDueAt!, `/projects/${r.projectId}?tab=documents`);
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
        where: { userId, type: { in: [...REMINDER_TYPES] }, createdAt: { gte: new Date(new Date().toDateString()) } },
      }),
    ]);

    const wantsApprovals = !filter.category || filter.category === 'APPROVALS';
    const wantsDeadlines = !filter.category || filter.category === 'DEADLINES';
    const deadlinesMuted = user?.mutedAlertCategories.includes('DEADLINES');
    let synthetic = [
      ...(wantsDeadlines && !deadlinesMuted ? await this.dueSoon(userId, dismissedToday) : []),
      ...(wantsApprovals ? await this.approvalReminders(userId, dismissedToday) : []),
    ];
    if (filter.unread) synthetic = synthetic.filter((n) => !n.isRead);
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
      where: { userId, type: { in: [...REMINDER_TYPES] }, createdAt: { gte: new Date(new Date().toDateString()) } },
    });
    const pending = [...(await this.dueSoon(userId, dismissedToday)), ...(await this.approvalReminders(userId, dismissedToday))].filter((n) => ids === 'all' || ids.includes(n.id));
    if (pending.length === 0) return;
    await this.prisma.notification.createMany({
      data: pending.map((n) => ({
        userId,
        projectId: n.projectId,
        link: n.link,
        type: n.type,
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
