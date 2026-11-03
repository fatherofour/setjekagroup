import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectsService } from '../projects/projects.service.js';
import { DESIGN_CONSULTANTS } from './consultants.js';

/** Who the caller is on a project's site records (interfaces, hidden works):
 * Setjeka, a quality person (the design consultants and QA/QC), the site
 * team, or a contractor who sees only their own firm's work. The client sees
 * none of it, as with inspections. */
export async function siteParty(prisma: PrismaService, projects: ProjectsService, projectId: string, userId: string) {
  await projects.findOneForOwner(projectId, userId);
  const [user, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, fullName: true } }),
    prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true, contractorId: true } }),
  ]);
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  const roles = members.map((m) => m.role);
  const quality = internal || roles.some((r) => DESIGN_CONSULTANTS.includes(r) || r === 'QA_QC_MANAGER');
  if (!internal && !members.some((m) => m.role !== 'CLIENT')) throw new NotFoundException('Not found');
  return {
    userId,
    name: user?.fullName ?? 'Someone',
    internal,
    memberIds: new Set(members.map((m) => m.id)),
    contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    contractor: !quality && roles.includes('CONTRACTOR'),
    quality,
    site: quality || roles.includes('CONTRACTOR') || roles.includes('SITE_MANAGER'),
  };
}

export type SiteParty = Awaited<ReturnType<typeof siteParty>>;

/** One line of a record's history: what it moved to, when, and who. */
export function historyEntry(w: SiteParty, status: string, comment?: string | null) {
  return { status, at: new Date().toISOString(), by: w.userId, name: w.name, comment: comment?.trim() || null };
}
