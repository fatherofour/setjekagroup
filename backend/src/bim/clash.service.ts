import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BimService } from './bim.service.js';
import { SelectionDto } from './rules.js';

export class ClashTestDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsObject() @ValidateNested() @Type(() => SelectionDto) selectionA!: SelectionDto;
  @IsObject() @ValidateNested() @Type(() => SelectionDto) selectionB!: SelectionDto;
  @IsOptional() @IsNumber() @Min(0) @Max(1) tolerance?: number;
}

export class ClashStatusDto {
  @IsIn(['NEW', 'ACTIVE', 'RESOLVED', 'APPROVED']) status!: 'NEW' | 'ACTIVE' | 'RESOLVED' | 'APPROVED';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class ClashIssueDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsObject() viewpoint?: Record<string, unknown>;
}

type Box = { documentId: string; globalId: string; expressId: number; name: string | null; ifcType: string; b: [number, number, number, number, number, number] };

/** Hard clashes between two selections of elements, found from their
 * bounding boxes (sort and sweep along X). Boxes overlapping by more than
 * the tolerance on every axis clash. Re-running a test keeps each clash's
 * status: one no longer found is marked resolved, one found again after
 * being resolved is active again. */
@Injectable()
export class ClashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bim: BimService,
    private readonly notifications: NotificationsService,
  ) {}

  private async team(projectId: string, userId: string) {
    const { client } = await this.bim.viewer(projectId, userId);
    if (client) throw new ForbiddenException('Clash detection is kept for the project team');
  }

  async tests(projectId: string, userId: string) {
    await this.team(projectId, userId);
    const tests = await this.prisma.clashTest.findMany({ where: { projectId }, include: { createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } });
    const counts = await this.prisma.clash.groupBy({ by: ['testId', 'status'], where: { projectId }, _count: { _all: true } });
    return tests.map((t) => ({ ...t, counts: Object.fromEntries(counts.filter((c) => c.testId === t.id).map((c) => [c.status, c._count._all])) }));
  }

  async save(projectId: string, userId: string, dto: ClashTestDto, id?: string) {
    await this.team(projectId, userId);
    const data = { name: dto.name.trim(), selectionA: dto.selectionA as object, selectionB: dto.selectionB as object, tolerance: dto.tolerance ?? 0.01 };
    if (id) {
      const t = await this.prisma.clashTest.findFirst({ where: { id, projectId } });
      if (!t) throw new NotFoundException('Clash test not found');
      await this.prisma.clashTest.update({ where: { id }, data });
    } else await this.prisma.clashTest.create({ data: { ...data, projectId, createdById: userId } });
    return this.tests(projectId, userId);
  }

  async remove(projectId: string, userId: string, id: string) {
    await this.team(projectId, userId);
    const t = await this.prisma.clashTest.findFirst({ where: { id, projectId } });
    if (!t) throw new NotFoundException('Clash test not found');
    await this.prisma.$transaction([this.prisma.comment.deleteMany({ where: { entityType: 'CLASH', entityId: { in: (await this.prisma.clash.findMany({ where: { testId: id }, select: { id: true } })).map((c) => c.id) } } }), this.prisma.clashTest.delete({ where: { id } })]);
    return this.tests(projectId, userId);
  }

  private boxes(rows: Awaited<ReturnType<BimService['selectElements']>>): Box[] {
    return rows
      .filter((e) => e.minX != null && e.maxX != null)
      .map((e) => ({ documentId: e.documentId, globalId: e.globalId, expressId: e.expressId, name: e.name, ifcType: e.ifcType, b: [e.minX!, e.minY!, e.minZ!, e.maxX!, e.maxY!, e.maxZ!] }));
  }

  /** Overlap of two boxes: the depth (smallest axis overlap) and its centre. */
  static overlap(a: Box['b'], b: Box['b'], tol: number) {
    let depth = Infinity;
    const centre: number[] = [];
    for (let k = 0; k < 3; k++) {
      const lo = Math.max(a[k], b[k]);
      const hi = Math.min(a[k + 3], b[k + 3]);
      const d = hi - lo;
      if (d <= tol) return null;
      depth = Math.min(depth, d);
      centre.push(Math.round(((lo + hi) / 2) * 1000) / 1000);
    }
    return { depth: Math.round(depth * 1000) / 1000, centre };
  }

  static detect(A: Box[], B: Box[], tol: number) {
    const tagged = [...A.map((x) => ({ x, side: 0 })), ...B.map((x) => ({ x, side: 1 }))].sort((p, q) => p.x.b[0] - q.x.b[0]);
    const active: typeof tagged = [];
    const found = new Map<string, { a: Box; b: Box; depth: number; centre: number[] }>();
    for (const cur of tagged) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i].x.b[3] <= cur.x.b[0] + tol) active.splice(i, 1);
      for (const o of active) {
        // A pair needs one element from each side; an element in both
        // selections appears on both sides, so the pair key dedupes.
        if (o.side === cur.side) continue;
        const [a, b] = o.side === 0 ? [o.x, cur.x] : [cur.x, o.x];
        if (a.documentId === b.documentId && a.globalId === b.globalId) continue;
        const ov = ClashService.overlap(a.b, b.b, tol);
        if (!ov) continue;
        const ka = `${a.documentId}:${a.globalId}`;
        const kb = `${b.documentId}:${b.globalId}`;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (!found.has(key)) found.set(key, { a, b, ...ov });
      }
      active.push(cur);
    }
    return found;
  }

  async run(projectId: string, userId: string, id: string) {
    await this.team(projectId, userId);
    const t = await this.prisma.clashTest.findFirst({ where: { id, projectId } });
    if (!t) throw new NotFoundException('Clash test not found');
    const t0 = Date.now();
    const [ra, rb] = await Promise.all([this.bim.selectElements(projectId, t.selectionA as SelectionDto), this.bim.selectElements(projectId, t.selectionB as SelectionDto)]);
    const A = this.boxes(ra);
    const B = this.boxes(rb);
    if (!A.length || !B.length) throw new BadRequestException('One side of the test selects no elements from a read model');
    if (A.length * B.length > 4e8) throw new BadRequestException('The selections are too wide; narrow them by model, type or storey');
    const found = ClashService.detect(A, B, t.tolerance);
    const existing = await this.prisma.clash.findMany({ where: { testId: id }, select: { id: true, key: true, status: true } });
    const byKey = new Map(existing.map((c) => [c.key, c]));
    const now = new Date();
    const creates = [];
    const updates = [];
    for (const [key, f] of found) {
      const old = byKey.get(key);
      const fields = { centre: f.centre, overlap: f.depth, lastSeenAt: now, aName: f.a.name, bName: f.b.name };
      if (!old) {
        creates.push({ testId: id, projectId, key, aDocumentId: f.a.documentId, aGlobalId: f.a.globalId, aType: f.a.ifcType, bDocumentId: f.b.documentId, bGlobalId: f.b.globalId, bType: f.b.ifcType, status: 'NEW' as const, ...fields });
      } else {
        updates.push(this.prisma.clash.update({ where: { id: old.id }, data: { ...fields, ...(old.status === 'RESOLVED' ? { status: 'ACTIVE' as const, resolvedAt: null } : old.status === 'NEW' ? { status: 'ACTIVE' as const } : {}) } }));
      }
    }
    const gone = existing.filter((c) => !found.has(c.key) && (c.status === 'NEW' || c.status === 'ACTIVE')).map((c) => c.id);
    for (let i = 0; i < creates.length; i += 1000) await this.prisma.clash.createMany({ data: creates.slice(i, i + 1000), skipDuplicates: true });
    for (let i = 0; i < updates.length; i += 200) await this.prisma.$transaction(updates.slice(i, i + 200));
    if (gone.length) await this.prisma.clash.updateMany({ where: { id: { in: gone } }, data: { status: 'RESOLVED', resolvedAt: now, note: 'No longer found when the test was run again' } });
    await this.prisma.clashTest.update({ where: { id }, data: { lastRunAt: now, lastRunMs: Date.now() - t0 } });
    return { found: found.size, new: creates.length, resolved: gone.length, elementsA: A.length, elementsB: B.length, ms: Date.now() - t0 };
  }

  async clashes(projectId: string, userId: string, testId: string, status?: string) {
    await this.team(projectId, userId);
    const t = await this.prisma.clashTest.findFirst({ where: { id: testId, projectId } });
    if (!t) throw new NotFoundException('Clash test not found');
    const rows = await this.prisma.clash.findMany({
      where: { testId, ...(status ? { status: status as 'NEW' } : {}) },
      orderBy: [{ status: 'asc' }, { overlap: 'desc' }],
      take: 2000,
    });
    const notes = await this.prisma.comment.groupBy({ by: ['entityId'], where: { entityType: 'CLASH', entityId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
    const n = new Map(notes.map((c) => [c.entityId, c._count._all]));
    const docs = await this.prisma.projectDocument.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.aDocumentId, r.bDocumentId]))] } }, select: { id: true, name: true } });
    const dn = new Map(docs.map((d) => [d.id, d.name]));
    return rows.map((r) => ({ ...r, aModel: dn.get(r.aDocumentId) ?? null, bModel: dn.get(r.bDocumentId) ?? null, noteCount: n.get(r.id) ?? 0 }));
  }

  private async clash(projectId: string, id: string) {
    const c = await this.prisma.clash.findFirst({ where: { id, projectId } });
    if (!c) throw new NotFoundException('Clash not found');
    return c;
  }

  async setStatus(projectId: string, userId: string, id: string, dto: ClashStatusDto) {
    await this.team(projectId, userId);
    await this.clash(projectId, id);
    return this.prisma.clash.update({ where: { id }, data: { status: dto.status, note: dto.note?.trim() || undefined, resolvedAt: dto.status === 'RESOLVED' || dto.status === 'APPROVED' ? new Date() : null } });
  }

  /** Raise an issue for a clash, linked to both elements in the model. */
  async raiseIssue(projectId: string, userId: string, id: string, dto: ClashIssueDto) {
    await this.team(projectId, userId);
    const c = await this.clash(projectId, id);
    if (c.issueId) throw new BadRequestException('An issue is already raised for this clash');
    if (dto.ownerId && !(await this.prisma.projectMember.findFirst({ where: { id: dto.ownerId, projectId } }))) throw new BadRequestException('The owner must be on the project');
    const label = (t: string, n: string | null) => [t.replace(/^IFC/i, ''), n].filter(Boolean).join(' ');
    const test = await this.prisma.clashTest.findUnique({ where: { id: c.testId }, select: { name: true } });
    const issue = await this.prisma.projectIssue.create({
      data: {
        projectId,
        title: dto.title?.trim() || `Clash: ${label(c.aType, c.aName)} / ${label(c.bType, c.bName)}`.slice(0, 200),
        description: `Found by the clash test "${test?.name}". ${label(c.aType, c.aName)} (GlobalId ${c.aGlobalId}) overlaps ${label(c.bType, c.bName)} (GlobalId ${c.bGlobalId}) by ${c.overlap} m.`,
        ownerId: dto.ownerId ?? null,
        priority: c.overlap > 0.1 ? 'HIGH' : 'MEDIUM',
      },
      include: { owner: { select: { userId: true } } },
    });
    for (const [documentId, globalId, ifcType, name] of [
      [c.aDocumentId, c.aGlobalId, c.aType, c.aName],
      [c.bDocumentId, c.bGlobalId, c.bType, c.bName],
    ] as const) {
      await this.prisma.modelObjectLink
        .create({ data: { projectId, documentId, globalId, ifcType, name, entityType: 'ISSUE', entityId: issue.id, viewpoint: (dto.viewpoint ?? undefined) as object | undefined, createdById: userId } })
        .catch(() => undefined);
    }
    await this.prisma.clash.update({ where: { id }, data: { issueId: issue.id, status: c.status === 'NEW' ? 'ACTIVE' : c.status } });
    if (issue.owner?.userId && issue.owner.userId !== userId) {
      await this.notifications.notify({ userId: issue.owner.userId, projectId, type: 'ISSUE_ASSIGNED', entityType: 'ISSUE', entityId: issue.id, message: `Clash issue: ${issue.title}` });
    }
    return { issueId: issue.id };
  }
}
