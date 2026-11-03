import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { HandoverKind, HandoverStatus, NotificationType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { DESIGN_CONSULTANTS } from '../common/consultants.js';
import type { HandoverItemDto, SubmitHandoverDto } from './dto/handover.dto.js';
import { handoverRootDir } from './upload.util.js';

/** The usual pack for a building contract, as a starting list. */
export const STARTER_PACK: { kind: HandoverKind; title: string }[] = [
  { kind: 'AS_BUILT', title: 'As-built drawings' },
  { kind: 'O_AND_M_MANUAL', title: 'Operations and maintenance manuals' },
  { kind: 'COMMISSIONING', title: 'Commissioning and test records' },
  { kind: 'STATUTORY_CERTIFICATE', title: 'Electrical certificate of compliance (SANS 10142-1)' },
  { kind: 'STATUTORY_CERTIFICATE', title: 'Plumbing certificate of compliance' },
  { kind: 'STATUTORY_CERTIFICATE', title: 'Fire installation certificate' },
  { kind: 'GUARANTEE', title: "Contractor's guarantee" },
  { kind: 'WARRANTY', title: "Manufacturers' warranties" },
  { kind: 'HEALTH_AND_SAFETY_FILE', title: 'Health and safety file' },
];

const INCLUDE = {
  contract: { select: { id: true, title: true, contractorId: true, contractor: { select: { name: true } } } },
  reviewedBy: { select: { fullName: true } },
  files: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true, uploadedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.HandoverItemInclude;
type Row = Prisma.HandoverItemGetPayload<{ include: typeof INCLUDE }>;

const DONE: HandoverStatus[] = ['ACCEPTED', 'HANDED_OVER'];
const EXPIRES: HandoverKind[] = ['WARRANTY', 'GUARANTEE'];
const REGISTER_STATUS: Record<HandoverStatus, string> = { OUTSTANDING: 'OUTSTANDING', RETURNED: 'OUTSTANDING', SUBMITTED: 'RECEIVED', ACCEPTED: 'RECEIVED', HANDED_OVER: 'DISTRIBUTED' };

/** The handover pack (the user's choice from the role-by-role review,
 * 2026-11-03). Setjeka, the consultants and QA/QC list what each contractor
 * hands over; the contractor uploads each and submits it; a consultant
 * accepts it or returns it; Setjeka hands the accepted pack to the client,
 * who then sees and downloads it. A contractor sees only their own
 * contracts; the client sees only what has been handed over. */
@Injectable()
export class HandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, fullName: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    return {
      userId,
      name: user?.fullName ?? 'Someone',
      internal,
      lead: internal || roles.includes('PROJECT_MANAGER') || roles.includes('DEVELOPMENT_MANAGER'),
      reviewer: internal || roles.some((r) => DESIGN_CONSULTANTS.includes(r) || ['QA_QC_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'].includes(r)),
      client: !internal && roles.length > 0 && roles.every((r) => r === 'CLIENT'),
      contractor: !internal && roles.includes('CONTRACTOR'),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    };
  }
  private sees(w: Awaited<ReturnType<HandoverService['who']>>, i: { status: HandoverStatus; contract: { contractorId: string } }) {
    if (w.client) return i.status === 'HANDED_OVER';
    if (w.contractor) return w.contractorIds.has(i.contract.contractorId);
    return true;
  }

  private mine(w: Awaited<ReturnType<HandoverService['who']>>, contractorId: string) {
    return w.internal || (w.contractor && w.contractorIds.has(contractorId));
  }

  private shape(w: Awaited<ReturnType<HandoverService['who']>>, i: Row) {
    const mine = this.mine(w, i.contract.contractorId);
    const open = i.status === 'OUTSTANDING' || i.status === 'RETURNED';
    return {
      ...i,
      needsExpiry: EXPIRES.includes(i.kind),
      overdue: open && Boolean(i.dueDate && i.dueDate.getTime() < Date.now()),
      expiringSoon: Boolean(i.expiresAt && i.expiresAt.getTime() - Date.now() < 30 * 86_400_000),
      can: {
        upload: mine && open,
        submit: mine && open && i.files.length > 0,
        accept: w.reviewer && i.status === 'SUBMITTED',
        return: w.reviewer && i.status === 'SUBMITTED',
        remove: w.reviewer && i.status === 'OUTSTANDING' && i.files.length === 0,
      },
    };
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'HANDOVER_ITEM', entityId: id, message });
    }
  }

  private async people(projectId: string, where: Prisma.ProjectMemberWhereInput) {
    return (await this.prisma.projectMember.findMany({ where: { projectId, userId: { not: null }, ...where }, select: { userId: true } })).map((m) => m.userId);
  }

  /** Each contract's pack: how far it has got, and what can be done. */
  async contracts(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.projectContract.findMany({
      where: { projectId, ...(w.contractor ? { contractorId: { in: [...w.contractorIds] } } : {}) },
      select: { id: true, title: true, contractorId: true, contractor: { select: { name: true } }, finalCompletionAt: true, handoverItems: { select: { status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ handoverItems, ...c }) => {
      const n = (s: HandoverStatus[]) => handoverItems.filter((i) => s.includes(i.status)).length;
      return {
        ...c,
        counts: w.client
          ? { total: n(['HANDED_OVER']), outstanding: 0, submitted: 0, accepted: 0, handedOver: n(['HANDED_OVER']) }
          : { total: handoverItems.length, outstanding: n(['OUTSTANDING', 'RETURNED']), submitted: n(['SUBMITTED']), accepted: n(['ACCEPTED']), handedOver: n(['HANDED_OVER']) },
        can: { addItems: w.reviewer, handOver: w.lead && n(['ACCEPTED']) > 0 },
      };
    });
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.handoverItem.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'asc' } });
    return rows.filter((i) => this.sees(w, i)).map((i) => this.shape(w, i));
  }

  private async load(w: Awaited<ReturnType<HandoverService['who']>>, projectId: string, id: string) {
    const i = await this.prisma.handoverItem.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!i || !this.sees(w, i)) throw new NotFoundException('Handover item not found');
    return i;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  private history(w: Awaited<ReturnType<HandoverService['who']>>, i: { history: unknown }, status: string, comment?: string | null) {
    return [...((i.history as unknown[]) ?? []), { status, at: new Date().toISOString(), by: w.userId, name: w.name, comment: comment?.trim() || null }] as Prisma.InputJsonValue;
  }

  private async syncRegister(i: Row, userId: string) {
    const data = {
      title: `${i.number} ${i.title}${i.system ? ` (${i.system})` : ''}`,
      category: i.kind,
      partyName: i.contract.contractor.name,
      contractorId: i.contract.contractorId,
      date: i.submittedAt,
      dueDate: i.expiresAt,
      status: REGISTER_STATUS[i.status],
      completedAt: i.handedOverAt,
      notes: i.handedOverAt ? 'Handed over to the client on the platform' : null,
    };
    if (i.registerEntryId && (await this.prisma.projectRegisterEntry.findUnique({ where: { id: i.registerEntryId } }))) {
      await this.prisma.projectRegisterEntry.update({ where: { id: i.registerEntryId }, data });
      return;
    }
    const e = await this.prisma.projectRegisterEntry.create({ data: { ...data, projectId: i.projectId, register: 'handover-documents', createdById: userId } });
    await this.prisma.handoverItem.update({ where: { id: i.id }, data: { registerEntryId: e.id } });
  }

  private async contract(projectId: string, contractId: string) {
    const c = await this.prisma.projectContract.findFirst({ where: { id: contractId, projectId }, select: { id: true, title: true, contractorId: true } });
    if (!c) throw new BadRequestException('Contract not found on this project');
    return c;
  }

  private async nextNumber(projectId: string) {
    const last = await this.prisma.handoverItem.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    return { sequence, number: `HO-${String(sequence).padStart(3, '0')}` };
  }

  private async created(projectId: string, userId: string, w: Awaited<ReturnType<HandoverService['who']>>, c: { id: string; title: string; contractorId: string }, items: { kind: HandoverKind; title: string; system?: string | null; dueDate?: Date | null }[]) {
    for (const it of items) {
      const { sequence, number } = await this.nextNumber(projectId);
      const row = await this.prisma.handoverItem.create({
        data: { projectId, contractId: c.id, sequence, number, kind: it.kind, title: it.title, system: it.system ?? null, dueDate: it.dueDate ?? null, history: [{ status: 'OUTSTANDING', at: new Date().toISOString(), by: userId, name: w.name, comment: 'Asked for' }] },
        include: INCLUDE,
      });
      await this.syncRegister(row, userId);
    }
    if (items.length) await this.tell(projectId, await this.people(projectId, { contractorId: c.contractorId, role: 'CONTRACTOR' }), userId, 'HANDOVER_REQUESTED', c.id, `${c.title}: ${items.length === 1 ? `"${items[0].title}" is` : `${items.length} handover documents are`} asked for. Upload and submit them.`);
  }

  async create(projectId: string, userId: string, dto: HandoverItemDto) {
    const w = await this.who(projectId, userId);
    if (!w.reviewer) throw new ForbiddenException('Setjeka, the consultants and QA/QC set what is handed over');
    const c = await this.contract(projectId, dto.contractId);
    await this.created(projectId, userId, w, c, [{ kind: dto.kind, title: dto.title.trim(), system: dto.system?.trim() || null, dueDate: dto.dueDate ? new Date(dto.dueDate) : null }]);
    const row = await this.prisma.handoverItem.findFirst({ where: { contractId: c.id }, orderBy: { sequence: 'desc' }, include: INCLUDE });
    return this.shape(w, row!);
  }

  /** Adds whichever of the usual pack the contract doesn't ask for yet. */
  async addStarter(projectId: string, userId: string, contractId: string) {
    const w = await this.who(projectId, userId);
    if (!w.reviewer) throw new ForbiddenException('Setjeka, the consultants and QA/QC set what is handed over');
    const c = await this.contract(projectId, contractId);
    const have = new Set((await this.prisma.handoverItem.findMany({ where: { contractId }, select: { title: true } })).map((i) => i.title));
    await this.created(projectId, userId, w, c, STARTER_PACK.filter((s) => !have.has(s.title)));
    return this.list(projectId, userId);
  }

  async remove(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.remove) throw new BadRequestException('Only an item nothing has been uploaded for is removed');
    await this.prisma.handoverItem.delete({ where: { id } });
    if (i.registerEntryId) await this.prisma.projectRegisterEntry.deleteMany({ where: { id: i.registerEntryId } });
    return { ok: true };
  }

  async upload(projectId: string, userId: string, id: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Choose a file');
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id).catch((e) => {
      this.unlink(file.filename);
      throw e;
    });
    if (!this.shape(w, i).can.upload) {
      this.unlink(file.filename);
      throw new BadRequestException('Files are added by the contractor until the item is submitted');
    }
    await this.prisma.handoverFile.create({ data: { itemId: id, filename: file.originalname, storedFilename: file.filename, mimeType: file.mimetype || 'application/octet-stream', size: file.size, uploadedById: userId } });
    return this.findOne(projectId, userId, id);
  }

  private unlink(stored: string) {
    try {
      unlinkSync(join(handoverRootDir(), stored));
    } catch {
      // already gone
    }
  }

  async removeFile(projectId: string, userId: string, id: string, fileId: string) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.upload) throw new BadRequestException('Files are removed only before the item is submitted');
    const f = i.files.find((x) => x.id === fileId);
    if (!f) throw new NotFoundException('File not found');
    const row = await this.prisma.handoverFile.delete({ where: { id: fileId } });
    this.unlink(row.storedFilename);
    return this.findOne(projectId, userId, id);
  }

  async fileFor(projectId: string, userId: string, id: string, fileId: string) {
    const w = await this.who(projectId, userId);
    await this.load(w, projectId, id);
    const f = await this.prisma.handoverFile.findFirst({ where: { id: fileId, itemId: id } });
    if (!f) throw new NotFoundException('File not found');
    return { path: join(handoverRootDir(), f.storedFilename), filename: f.filename, mimeType: f.mimeType };
  }

  async submit(projectId: string, userId: string, id: string, dto: SubmitHandoverDto) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.submit) throw new BadRequestException(i.files.length ? 'Only the contractor submits an outstanding or returned item' : 'Upload the document first');
    if (EXPIRES.includes(i.kind) && !dto.expiresAt && !i.expiresAt) throw new BadRequestException('Give the date the warranty or guarantee runs to');
    const updated = await this.prisma.handoverItem.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), issuer: dto.issuer?.trim() || i.issuer, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : i.expiresAt, history: this.history(w, i, 'SUBMITTED', dto.comment || `${i.files.length} file${i.files.length === 1 ? '' : 's'}`) },
      include: INCLUDE,
    });
    await this.syncRegister(updated, userId);
    await this.tell(projectId, await this.people(projectId, { role: { in: ['PROJECT_MANAGER', 'QA_QC_MANAGER', ...DESIGN_CONSULTANTS] } }), userId, 'HANDOVER_SUBMITTED', id, `${i.number} "${i.title}" from ${i.contract.contractor.name} is in for review`);
    return this.findOne(projectId, userId, id);
  }

  private async decide(projectId: string, userId: string, id: string, to: 'ACCEPTED' | 'RETURNED', comment: string | undefined) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.accept) throw new BadRequestException('Only a submitted item is accepted or returned, by a consultant, QA/QC or Setjeka');
    const updated = await this.prisma.handoverItem.update({ where: { id }, data: { status: to, reviewedById: userId, reviewedAt: new Date(), reviewComment: comment?.trim() || null, history: this.history(w, i, to, comment) }, include: INCLUDE });
    await this.syncRegister(updated, userId);
    await this.tell(projectId, await this.people(projectId, { contractorId: i.contract.contractorId, role: 'CONTRACTOR' }), userId, 'HANDOVER_DECIDED', id, to === 'ACCEPTED' ? `${i.number} "${i.title}" was accepted` : `${i.number} "${i.title}" was returned - ${comment}`);
    return this.findOne(projectId, userId, id);
  }

  accept(projectId: string, userId: string, id: string, comment?: string) {
    return this.decide(projectId, userId, id, 'ACCEPTED', comment);
  }

  return(projectId: string, userId: string, id: string, reason: string) {
    return this.decide(projectId, userId, id, 'RETURNED', reason);
  }

  /** Setjeka hands the accepted documents to the client. */
  async handOver(projectId: string, userId: string, contractId: string, itemIds?: string[]) {
    const w = await this.who(projectId, userId);
    if (!w.lead) throw new ForbiddenException("Setjeka's PM hands the pack to the client");
    const c = await this.contract(projectId, contractId);
    const items = await this.prisma.handoverItem.findMany({ where: { contractId, status: 'ACCEPTED', ...(itemIds?.length ? { id: { in: itemIds } } : {}) }, include: INCLUDE });
    if (!items.length) throw new BadRequestException('Nothing accepted to hand over');
    const now = new Date();
    for (const i of items) {
      const updated = await this.prisma.handoverItem.update({ where: { id: i.id }, data: { status: 'HANDED_OVER', handedOverAt: now, history: this.history(w, i, 'HANDED_OVER', 'Handed to the client') }, include: INCLUDE });
      await this.syncRegister(updated, userId);
    }
    await this.tell(projectId, await this.people(projectId, { role: 'CLIENT' }), userId, 'HANDOVER_DELIVERED', c.id, `${c.title}: ${items.length} handover document${items.length === 1 ? ' is' : 's are'} ready for you - ${items.map((i) => i.title).slice(0, 3).join(', ')}${items.length > 3 ? '…' : ''}`);
    return this.contracts(projectId, userId);
  }
}

/** What a contract still owes of its handover pack, for final completion. */
export async function handoverOutstanding(prisma: PrismaService, contractId: string) {
  return prisma.handoverItem.count({ where: { contractId, status: { notIn: DONE } } });
}
