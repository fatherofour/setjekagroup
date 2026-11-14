import type { ProjectMemberRole } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** The delivery-team roles the permission matrix gives full access to
 * (prisma/seed.ts FULL_ACCESS_ROLES). */
export const SETJEKA_TEAM_ROLES: ProjectMemberRole[] = ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER'];

/** Whether the caller is Setjeka on this project: an internal account, or a
 * member in one of the delivery-team roles. Outside parties (consultants,
 * contractors, the client) are not, whatever the matrix allows them, so
 * services can keep destructive actions to their own records. */
export async function onSetjekaTeam(prisma: PrismaService, projectId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
  if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return true;
  return Boolean(await prisma.projectMember.findFirst({ where: { projectId, userId, role: { in: SETJEKA_TEAM_ROLES } } }));
}

/** Whether the caller may see the project's own money: its value with the
 * client and its contingency, and every firm's contract sum. Setjeka's staff,
 * the client and the QS (critique M-01, the user's rule of 14 Nov 2026). A
 * contractor or consultant sees only their own firm's deals (FirmDealsService). */
export async function seesProjectMoney(prisma: PrismaService, projectId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
  if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return true;
  return Boolean(await prisma.projectMember.findFirst({ where: { projectId, userId, role: { in: ['CLIENT', 'QUANTITY_SURVEYOR'] } } }));
}
