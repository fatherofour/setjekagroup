import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Who may change a shared record (critique V3-H-01): Setjeka's staff
 * change anything; an outside party changes only what they raised, and may
 * move on (change the status of) what is assigned to them. Before this, any
 * member with the area's EDIT right could rewrite or close another firm's
 * RFI, task, issue or submittal. */
export interface EditRights {
  internal: boolean;
  /** This person's membership rows on the project. */
  memberIds: Set<string>;
  /** Their first membership row, recorded as the raiser of what they add. */
  selfMemberId: string | null;
}

export async function editRights(prisma: PrismaService, projectId: string, userId: string): Promise<EditRights> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  if (internal) return { internal, memberIds: new Set(), selfMemberId: null };
  const members = await prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  return { internal, memberIds: new Set(members.map((m) => m.id)), selfMemberId: members[0]?.id ?? null };
}

export type OwnRight = 'all' | 'status' | null;

/** What this person may change on a record: everything, its status only
 * (it's assigned to them), or nothing. */
export function ownRight(
  r: EditRights,
  userId: string,
  rec: { createdByUserId?: string | null; raisedMemberId?: string | null; assigneeMemberIds?: (string | null | undefined)[] },
): OwnRight {
  if (r.internal) return 'all';
  if (rec.createdByUserId === userId) return 'all';
  if (rec.raisedMemberId && r.memberIds.has(rec.raisedMemberId)) return 'all';
  if ((rec.assigneeMemberIds ?? []).some((id) => id && r.memberIds.has(id))) return 'status';
  return null;
}

/** Refuse a change the person may not make. `fields` are the keys the
 * request sets; `statusFields` are the ones an assignee may set. */
export function assertMayChange(right: OwnRight, fields: string[], statusFields: string[], what: string) {
  if (right === 'all') return;
  if (right === 'status' && fields.every((f) => statusFields.includes(f))) return;
  if (right === 'status') throw new ForbiddenException(`You can change only the status of ${what} assigned to you`);
  throw new ForbiddenException(`Only whoever raised this ${what}, the person it's assigned to, or Setjeka can change it`);
}

/** The keys a request actually sets. */
export const setKeys = (dto: object) => Object.entries(dto).filter(([, v]) => v !== undefined).map(([k]) => k);
