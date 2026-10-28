import { ForbiddenException, Injectable } from '@nestjs/common';
import type { NotificationType, ProjectMemberRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface QsAccess {
  internal: boolean;
  qs: boolean;
  client: boolean;
  roles: ProjectMemberRole[];
}

/** Who may do what with the QS's records. The permission matrix lets the
 * QS create and edit commercial records; these are the finer rules on top:
 * the QS or Setjeka prepare; only Setjeka accepts a bill, issues a
 * certificate or records a payment; only the client approves payment. */
@Injectable()
export class QsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  async of(projectId: string, userId: string): Promise<QsAccess> {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    return { internal, qs: roles.includes('QUANTITY_SURVEYOR'), client: !internal && roles.includes('CLIENT'), roles };
  }

  /** The QS or Setjeka staff. */
  preparer(a: QsAccess) {
    if (!a.internal && !a.qs) throw new ForbiddenException('Only the quantity surveyor or Setjeka does this');
  }

  setjeka(a: QsAccess, what: string) {
    if (!a.internal) throw new ForbiddenException(`Only Setjeka ${what}`);
  }

  async usersIn(projectId: string, roles: ProjectMemberRole[]) {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: roles }, userId: { not: null } }, select: { userId: true } });
    return [...new Set(rows.map((r) => r.userId!))];
  }

  async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, message: string, link: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'PROJECT', entityId: projectId, message, link });
    }
  }
}
