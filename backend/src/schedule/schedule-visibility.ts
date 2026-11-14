import type { PrismaService } from '../prisma/prisma.service.js';

export type ScheduleLink = 'WAITING_ON' | 'WAITS_FOR_YOU';

/** Which programme activities a person sees (critique M-02; the user's
 * choice, 14 Nov 2026). Everyone sees the whole programme except a
 * contractor (someone whose only role on the project is CONTRACTOR): they see
 * their own firm's activities, other firms' activities linked to theirs ("you
 * are waiting on this" / "this is waiting on your work", e.g. HVAC before the
 * electrical wiring), and the summary rows above them. Returns null for "the
 * whole programme". */
export async function scheduleVisibility(prisma: PrismaService, projectId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
  if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return null;
  const members = await prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true, contractorId: true } });
  if (!members.length || !members.every((m) => m.role === 'CONTRACTOR')) return null;
  const firms = members.flatMap((m) => (m.contractorId ? [m.contractorId] : []));

  const all = await prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true, parentId: true, contractorId: true } });
  const mine = new Set(all.filter((a) => a.contractorId && firms.includes(a.contractorId)).map((a) => a.id));
  const link = new Map<string, ScheduleLink>();
  if (mine.size) {
    const deps = await prisma.scheduleDependency.findMany({ where: { projectId, OR: [{ predecessorId: { in: [...mine] } }, { successorId: { in: [...mine] } }] }, select: { predecessorId: true, successorId: true } });
    for (const d of deps) {
      if (mine.has(d.successorId) && !mine.has(d.predecessorId)) link.set(d.predecessorId, 'WAITING_ON');
      else if (mine.has(d.predecessorId) && !mine.has(d.successorId) && !link.has(d.successorId)) link.set(d.successorId, 'WAITS_FOR_YOU');
    }
  }
  const ids = new Set([...mine, ...link.keys()]);
  // The summary rows above each one, so the outline still reads.
  const parentOf = new Map(all.map((a) => [a.id, a.parentId]));
  for (const id of [...ids]) {
    let p = parentOf.get(id);
    while (p && !ids.has(p)) {
      ids.add(p);
      p = parentOf.get(p);
    }
  }
  return { ids, mine, link };
}
