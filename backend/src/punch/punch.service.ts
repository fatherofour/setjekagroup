import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PunchStatus } from '../generated/prisma/enums.js';
import { uploadRootDir } from '../project-documents/upload.util.js';

export class PunchItemDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(100) category?: string | null;
  @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Pinned to a drawing: the revision, page and position (page fractions). */
  @IsOptional() @IsUUID() revisionId?: string | null;
  @IsOptional() @IsInt() @Min(1) page?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1) x?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1) y?: number | null;
  @IsOptional() @IsUUID() assigneeId?: string | null;
  @IsOptional() @IsDateString() dueDate?: string | null;
}

export class PunchNoteDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class PunchQuery {
  @IsOptional() @IsIn(['OPEN', 'READY_FOR_INSPECTION', 'CLOSED']) status?: PunchStatus;
  @IsOptional() @IsUUID() revisionId?: string;
}

const INCLUDE = {
  assignee: { select: { id: true, role: true, userId: true, externalName: true, externalCompany: true, user: { select: { fullName: true } }, contractor: { select: { name: true } } } },
  raisedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { fullName: true } },
  document: { select: { id: true, name: true, drawingNumber: true } },
  revision: { select: { id: true, revisionNumber: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.PunchItemInclude;

const INSPECTORS = ['ARCHITECT', 'ARCHITECT_ENGINEER', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER', 'QA_QC_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER', 'SITE_MANAGER'];
const PRIORITY_COLOR = { LOW: rgb(0.39, 0.45, 0.55), MEDIUM: rgb(0.85, 0.47, 0.02), HIGH: rgb(0.86, 0.15, 0.15), CRITICAL: rgb(0.5, 0.05, 0.05) };

/** The punch list (donor "punchlist"; Architect 5.13 and 6.1): snags pinned
 * to the drawing, given to whoever puts them right. They say when it's done;
 * the architect (or Setjeka) inspects and closes it or sends it back. */
@Injectable()
export class PunchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, roles] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    if (!internal && roles.length && roles.every((r) => r.role === 'CLIENT')) throw new ForbiddenException('The punch list is kept by the project team');
    return { userId, internal, memberIds: roles.map((r) => r.id), inspector: internal || roles.some((r) => INSPECTORS.includes(r.role)) };
  }

  private shape(me: Awaited<ReturnType<PunchService['who']>>, p: Prisma.PunchItemGetPayload<{ include: typeof INCLUDE }>) {
    const mine = Boolean(p.assigneeId && me.memberIds.includes(p.assigneeId));
    return {
      ...p,
      assigneeName: p.assignee ? (p.assignee.user?.fullName ?? p.assignee.externalName ?? '—') : null,
      assigneeCompany: p.assignee ? (p.assignee.contractor?.name ?? p.assignee.externalCompany) : null,
      photoCount: p._count.photos,
      overdue: Boolean(p.dueDate && p.status !== 'CLOSED' && p.dueDate.getTime() < Date.now()),
      can: {
        edit: p.status === 'OPEN' && (me.internal || p.raisedById === me.userId),
        markReady: p.status === 'OPEN' && (mine || me.internal),
        inspect: p.status === 'READY_FOR_INSPECTION' && me.inspector,
        reopen: p.status === 'CLOSED' && me.inspector,
      },
    };
  }

  async list(projectId: string, userId: string, q: PunchQuery) {
    const me = await this.who(projectId, userId);
    const rows = await this.prisma.punchItem.findMany({
      where: { projectId, ...(q.status ? { status: q.status } : {}), ...(q.revisionId ? { revisionId: q.revisionId } : {}) },
      include: INCLUDE,
      orderBy: [{ sequence: 'desc' }],
    });
    return rows.map((r) => this.shape(me, r));
  }

  private async load(projectId: string, id: string) {
    const p = await this.prisma.punchItem.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!p) throw new NotFoundException('Punch item not found');
    return p;
  }

  private async data(projectId: string, dto: PunchItemDto) {
    let documentId: string | null | undefined;
    if (dto.revisionId) {
      const r = await this.prisma.documentRevision.findFirst({ where: { id: dto.revisionId, document: { projectId, deletedAt: null } }, select: { documentId: true } });
      if (!r) throw new BadRequestException('Drawing not found on this project');
      documentId = r.documentId;
      if (dto.x == null || dto.y == null) throw new BadRequestException('Place the item on the drawing');
    } else if (dto.revisionId === null) documentId = null;
    if (dto.assigneeId) {
      const m = await this.prisma.projectMember.findFirst({ where: { id: dto.assigneeId, projectId } });
      if (!m || m.role === 'CLIENT') throw new BadRequestException('Give it to someone on the project team');
    }
    return {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      category: dto.category?.trim() || null,
      location: dto.location?.trim() || null,
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.revisionId !== undefined ? { revisionId: dto.revisionId, documentId, page: dto.revisionId ? (dto.page ?? 1) : null, x: dto.revisionId ? dto.x : null, y: dto.revisionId ? dto.y : null } : {}),
      ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
      ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
    };
  }

  private async tell(projectId: string, userId: string | null | undefined, from: string, type: 'PUNCH_ITEM_ASSIGNED' | 'PUNCH_ITEM_READY' | 'PUNCH_ITEM_DECIDED', id: string, message: string) {
    if (!userId || userId === from) return;
    await this.notifications.notify({ userId, projectId, type, entityType: 'PUNCH_ITEM', entityId: id, message });
  }

  async create(projectId: string, userId: string, dto: PunchItemDto) {
    const me = await this.who(projectId, userId);
    if (!me.inspector) throw new ForbiddenException('The architect, the engineers or Setjeka raise punch items');
    const last = await this.prisma.punchItem.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const p = await this.prisma.punchItem.create({
      data: { projectId, sequence, number: `PL-${String(sequence).padStart(3, '0')}`, raisedById: userId, ...(await this.data(projectId, dto)) },
      include: INCLUDE,
    });
    await this.tell(projectId, p.assignee?.userId, userId, 'PUNCH_ITEM_ASSIGNED', p.id, `Punch item ${p.number}: ${p.title}`);
    return this.shape(me, p);
  }

  async update(projectId: string, userId: string, id: string, dto: PunchItemDto) {
    const me = await this.who(projectId, userId);
    const before = await this.load(projectId, id);
    if (!this.shape(me, before).can.edit) throw new BadRequestException('Only an open item is changed, by whoever raised it or Setjeka');
    const p = await this.prisma.punchItem.update({ where: { id }, data: await this.data(projectId, dto), include: INCLUDE });
    if (p.assigneeId !== before.assigneeId) await this.tell(projectId, p.assignee?.userId, userId, 'PUNCH_ITEM_ASSIGNED', p.id, `Punch item ${p.number}: ${p.title}`);
    return this.shape(me, p);
  }

  async markReady(projectId: string, userId: string, id: string, note?: string) {
    const me = await this.who(projectId, userId);
    const p = await this.load(projectId, id);
    if (!this.shape(me, p).can.markReady) throw new ForbiddenException('Whoever the item is given to says when it is done');
    const out = await this.prisma.punchItem.update({ where: { id }, data: { status: 'READY_FOR_INSPECTION', readyAt: new Date(), readyNote: note?.trim() || null, rejectedNote: null }, include: INCLUDE });
    await this.tell(projectId, p.raisedById, userId, 'PUNCH_ITEM_READY', id, `${p.number} ${p.title} is ready for inspection`);
    return this.shape(me, out);
  }

  /** The inspector closes it, or sends it back with a note. */
  async decide(projectId: string, userId: string, id: string, accept: boolean, note?: string) {
    const me = await this.who(projectId, userId);
    const p = await this.load(projectId, id);
    if (!this.shape(me, p).can.inspect) throw new ForbiddenException('The architect, an engineer or Setjeka inspects it once it is ready');
    if (!accept && !note?.trim()) throw new BadRequestException('Say what is still wrong');
    const out = await this.prisma.punchItem.update({
      where: { id },
      data: accept ? { status: 'CLOSED', closedAt: new Date(), closedById: userId } : { status: 'OPEN', rejectedNote: note!.trim(), readyAt: null },
      include: INCLUDE,
    });
    await this.tell(projectId, p.assignee?.userId, userId, 'PUNCH_ITEM_DECIDED', id, accept ? `${p.number} ${p.title} is closed` : `${p.number} ${p.title} was sent back: ${note!.trim()}`);
    return this.shape(me, out);
  }

  async reopen(projectId: string, userId: string, id: string, note: string) {
    const me = await this.who(projectId, userId);
    const p = await this.load(projectId, id);
    if (!this.shape(me, p).can.reopen) throw new ForbiddenException('Only a closed item is reopened, by an inspector');
    const out = await this.prisma.punchItem.update({ where: { id }, data: { status: 'OPEN', closedAt: null, closedById: null, rejectedNote: note?.trim() || null }, include: INCLUDE });
    await this.tell(projectId, p.assignee?.userId, userId, 'PUNCH_ITEM_DECIDED', id, `${p.number} ${p.title} was reopened`);
    return this.shape(me, out);
  }

  async remove(projectId: string, userId: string, id: string) {
    const me = await this.who(projectId, userId);
    const p = await this.load(projectId, id);
    if (!me.internal && p.raisedById !== userId) throw new ForbiddenException('Only whoever raised it, or Setjeka, deletes it');
    if (p.status !== 'OPEN') throw new BadRequestException('Close or reopen it instead - it is on the record');
    await this.prisma.punchItem.delete({ where: { id } });
  }

  /** The punch list for handover: each drawing with its numbered pins, then
   * the full list. */
  async pdf(projectId: string, userId: string) {
    await this.who(projectId, userId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, projectCode: true } });
    const items = await this.prisma.punchItem.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'asc' } });
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);
    const safe = (f: PDFFont, s: string) => [...s].map((ch) => { try { f.encodeText(ch); return ch; } catch { return '?'; } }).join('');

    // Drawings with pins.
    const byRevision = new Map<string, typeof items>();
    for (const it of items) if (it.revisionId && it.x != null && it.y != null) byRevision.set(it.revisionId, [...(byRevision.get(it.revisionId) ?? []), it]);
    for (const [revisionId, pins] of byRevision) {
      const rev = await this.prisma.documentRevision.findUnique({ where: { id: revisionId }, select: { storedFilename: true, mimeType: true, originalFilename: true } });
      if (!rev) continue;
      const path = join(uploadRootDir(), rev.storedFilename);
      if (!existsSync(path) || !(rev.mimeType === 'application/pdf' || /\.pdf$/i.test(rev.originalFilename))) continue;
      try {
        const src = await PDFDocument.load(readFileSync(path), { ignoreEncryption: true });
        const pagesNeeded = [...new Set(pins.map((p) => (p.page ?? 1) - 1))].filter((n) => n < src.getPageCount());
        const copied = await out.copyPages(src, pagesNeeded);
        copied.forEach((page, k) => {
          out.addPage(page);
          const box = page.getCropBox();
          const r = Math.max(6, Math.min(box.width, box.height) / 90);
          for (const p of pins.filter((x) => (x.page ?? 1) - 1 === pagesNeeded[k])) {
            const cx = box.x + p.x! * box.width;
            const cy = box.y + box.height - p.y! * box.height;
            page.drawCircle({ x: cx, y: cy, size: r, color: p.status === 'CLOSED' ? rgb(0.09, 0.64, 0.29) : PRIORITY_COLOR[p.priority], borderColor: rgb(1, 1, 1), borderWidth: r / 6 });
            const label = String(p.sequence);
            page.drawText(label, { x: cx - bold.widthOfTextAtSize(label, r) / 2, y: cy - r / 3, size: r, font: bold, color: rgb(1, 1, 1) });
          }
        });
      } catch {
        // an unreadable drawing just leaves its pins to the list
      }
    }

    // The list.
    const W = 842;
    const H = 595;
    const M = 36;
    let page = out.addPage([W, H]);
    let y = H - M;
    const head = () => {
      page.drawText(safe(bold, `Punch list · ${project.name}${project.projectCode ? ` (${project.projectCode})` : ''}`), { x: M, y, size: 14, font: bold });
      y -= 22;
      const cols: [string, number][] = [['No.', M], ['Item', M + 52], ['Where', M + 330], ['Given to', M + 470], ['Due', M + 600], ['Status', M + 670]];
      for (const [t, x] of cols) page.drawText(t.toUpperCase(), { x, y, size: 7.5, font: bold, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
    };
    head();
    const day = (d: Date | null) => (d ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' }) : '—');
    const cut = (f: PDFFont, s: string, w: number, size: number) => {
      let t = safe(f, s);
      while (t.length > 1 && f.widthOfTextAtSize(t, size) > w) t = t.slice(0, -2) + '…';
      return t;
    };
    for (const it of items) {
      if (y < M + 20) {
        page = out.addPage([W, H]);
        y = H - M;
        head();
      }
      const where = it.document ? `${it.document.drawingNumber ?? it.document.name}${it.location ? ` · ${it.location}` : ''}` : (it.location ?? '—');
      const status = it.status === 'CLOSED' ? `Closed ${day(it.closedAt)}` : it.status === 'READY_FOR_INSPECTION' ? 'Ready for inspection' : 'Open';
      const cells: [string, number, number, PDFFont][] = [
        [it.number, M, 48, bold],
        [it.title, M + 52, 270, font],
        [where, M + 330, 135, font],
        [it.assignee ? (it.assignee.contractor?.name ?? it.assignee.externalCompany ?? it.assignee.user?.fullName ?? '—') : '—', M + 470, 125, font],
        [day(it.dueDate), M + 600, 65, font],
        [status, M + 670, 136, font],
      ];
      for (const [t, x, w, f] of cells) page.drawText(cut(f, t, w, 9), { x, y, size: 9, font: f });
      y -= 15;
    }
    if (!items.length) page.drawText('No punch items.', { x: M, y, size: 10, font });
    return { bytes: Buffer.from(await out.save()), filename: `Punch list - ${project.name}.pdf`.replace(/[^\w\- .]+/g, ' ') };
  }
}
