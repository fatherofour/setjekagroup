import type { Prisma } from '../generated/prisma/client.js';
import type { OrganisationProjectRole } from '../generated/prisma/enums.js';
import { MEMBER_ROLE_BY_APPOINTMENT } from './procsa.js';

/** Puts an appointed consultant firm on a project's Team: one member per
 * active vendor-portal login (so those logins can open the project), or a
 * single directory-only member from the firm's contact details if it has
 * none. Used by opportunity conversion and by project-level awards. */
export async function addConsultantMembers(tx: Prisma.TransactionClient, projectId: string, contractorId: string, role: OrganisationProjectRole) {
  const contractor = await tx.contractor.findUniqueOrThrow({
    where: { id: contractorId },
    select: {
      contactName: true,
      email: true,
      phone: true,
      portalUsers: { where: { status: 'ACTIVE' }, select: { id: true, fullName: true, email: true } },
    },
  });
  const memberRole = MEMBER_ROLE_BY_APPOINTMENT[role] ?? 'OTHER';
  const existing = await tx.projectMember.findMany({ where: { projectId, contractorId }, select: { userId: true } });
  const alreadyIn = new Set(existing.map((m) => m.userId));
  const logins = contractor.portalUsers.filter((u) => !alreadyIn.has(u.id));

  if (contractor.portalUsers.length) {
    if (logins.length) {
      await tx.projectMember.createMany({
        data: logins.map((u) => ({ projectId, role: memberRole, contractorId, userId: u.id, externalName: u.fullName, externalEmail: u.email })),
      });
    }
  } else if (existing.length === 0) {
    await tx.projectMember.create({
      data: { projectId, role: memberRole, contractorId, externalName: contractor.contactName, externalEmail: contractor.email, externalPhone: contractor.phone },
    });
  }
}
