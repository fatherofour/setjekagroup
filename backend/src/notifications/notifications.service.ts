import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationType, CommentEntityType } from '../generated/prisma/enums.js';

const DUE_SOON_WINDOW_DAYS = 2;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a notification for a user — a no-op if `userId` is null (e.g. an
   * assignee that's an external contact with no linked platform account). */
  async notify(params: {
    userId: string | null | undefined;
    projectId: string;
    type: NotificationType;
    entityType: CommentEntityType;
    entityId: string;
    message: string;
  }) {
    if (!params.userId) return;
    await this.prisma.notification.create({
      data: {
        userId: params.userId,
        projectId: params.projectId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        message: params.message,
      },
    });
  }

  /** All notifications for a user, newest first — persisted rows plus
   * synthetic (non-persisted) DUE_SOON entries computed on the fly for their
   * assigned tasks/issues due within the next two days. There is no
   * scheduler anywhere in this app, so "due soon" can't be a background job;
   * computing it opportunistically at read time is the honest alternative,
   * and skips manufacturing a duplicate when a real DUE_SOON row already
   * exists for that entity today. */
  async findAllForUser(userId: string) {
    const [persisted, member] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.projectMember.findMany({ where: { userId }, select: { id: true, projectId: true } }),
    ]);

    const dueWindow = new Date();
    dueWindow.setDate(dueWindow.getDate() + DUE_SOON_WINDOW_DAYS);
    const memberIds = member.map((m) => m.id);
    const projectIdByMemberId = new Map(member.map((m) => [m.id, m.projectId]));

    const alreadyNotifiedToday = new Set(
      persisted
        .filter((n) => n.type === 'DUE_SOON' && n.createdAt.toDateString() === new Date().toDateString())
        .map((n) => `${n.entityType}:${n.entityId}`),
    );

    const synthetic: (typeof persisted)[number][] = [];
    if (memberIds.length > 0) {
      const [dueTasks, dueIssues, dueRisks] = await Promise.all([
        this.prisma.projectTask.findMany({
          where: { assignedToId: { in: memberIds }, dueDate: { lte: dueWindow, not: null }, status: { not: 'DONE' } },
        }),
        this.prisma.projectIssue.findMany({
          where: { ownerId: { in: memberIds }, dueDate: { lte: dueWindow, not: null }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        }),
        this.prisma.projectRisk.findMany({
          where: { ownerId: { in: memberIds }, reviewDate: { lte: dueWindow, not: null }, status: { not: 'CLOSED' } },
        }),
      ]);
      for (const task of dueTasks) {
        if (alreadyNotifiedToday.has(`TASK:${task.id}`)) continue;
        synthetic.push({
          id: `synthetic-task-${task.id}`,
          userId,
          projectId: projectIdByMemberId.get(task.assignedToId!) ?? '',
          type: 'DUE_SOON',
          entityType: 'TASK',
          entityId: task.id,
          message: `Task "${task.title}" is due soon`,
          isRead: false,
          createdAt: task.dueDate!,
        });
      }
      for (const issue of dueIssues) {
        if (alreadyNotifiedToday.has(`ISSUE:${issue.id}`)) continue;
        synthetic.push({
          id: `synthetic-issue-${issue.id}`,
          userId,
          projectId: projectIdByMemberId.get(issue.ownerId!) ?? '',
          type: 'DUE_SOON',
          entityType: 'ISSUE',
          entityId: issue.id,
          message: `Issue "${issue.title}" is due soon`,
          isRead: false,
          createdAt: issue.dueDate!,
        });
      }
      for (const risk of dueRisks) {
        if (alreadyNotifiedToday.has(`RISK:${risk.id}`)) continue;
        synthetic.push({
          id: `synthetic-risk-${risk.id}`,
          userId,
          projectId: projectIdByMemberId.get(risk.ownerId!) ?? '',
          type: 'DUE_SOON',
          entityType: 'RISK',
          entityId: risk.id,
          message: `Risk "${risk.title}" is due for review`,
          isRead: false,
          createdAt: risk.reviewDate!,
        });
      }
    }

    return [...synthetic, ...persisted].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async markRead(userId: string, id: string) {
    // Synthetic due-soon entries have no row to update — silently accept.
    if (id.startsWith('synthetic-')) return { id, isRead: true };
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { id, isRead: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }
}
