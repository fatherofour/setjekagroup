import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { uploadRootDir } from '../project-documents/upload.util.js';
import { extractIfc } from './bim-extract.js';
import { selects, type ElementLike, type SelectionDto } from './rules.js';

export class FederationDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) documentIds!: string[];
}

export interface ElementQuery {
  documentId?: string;
  revisionId?: string;
  ifcType?: string;
  storey?: string;
  q?: string;
  page?: string;
}

const ELEMENT_LIST = { id: true, documentId: true, revisionId: true, expressId: true, globalId: true, ifcType: true, name: true, typeName: true, storey: true, material: true, properties: true, quantities: true, minX: true, minY: true, minZ: true, maxX: true, maxY: true, maxZ: true } as const;

/** The BIM hub (donor bim_hub + coordination_hub): every IFC revision read
 * into elements on the server, browsed with their properties and quantities,
 * compared revision against revision, grouped into federations, and summed
 * up on a coordination dashboard with the clashes, model issues, requirement
 * scores and smart views. */
@Injectable()
export class BimService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('BimHub');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  // ---- Reading models ------------------------------------------------------

  onModuleInit() {
    if (process.env.BIM_PROCESSING === 'off') return;
    void this.prisma.bimProcessing.deleteMany({ where: { status: 'PROCESSING' } }).catch(() => undefined);
    this.timer = setInterval(() => void this.run(), 15_000);
    setTimeout(() => void this.run(), 4_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Read the next model revision not yet read, one at a time. */
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const r = await this.prisma.documentRevision.findFirst({
          where: { originalFilename: { endsWith: '.ifc', mode: 'insensitive' }, bimProcessing: null, document: { deletedAt: null } },
          select: { id: true, documentId: true, storedFilename: true, originalFilename: true, document: { select: { projectId: true } } },
          orderBy: { uploadedAt: 'desc' },
        });
        if (!r) break;
        await this.process(r);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(r: { id: string; documentId: string; storedFilename: string; originalFilename: string; document: { projectId: string } }) {
    await this.prisma.bimProcessing.create({ data: { revisionId: r.id, status: 'PROCESSING' } });
    try {
      const path = join(uploadRootDir(), r.storedFilename);
      if (!existsSync(path)) throw new Error('The model file is missing');
      const t0 = Date.now();
      const out = await extractIfc(new Uint8Array(readFileSync(path)));
      await this.prisma.bimElement.deleteMany({ where: { revisionId: r.id } });
      for (let i = 0; i < out.elements.length; i += 500) {
        await this.prisma.bimElement.createMany({
          data: out.elements.slice(i, i + 500).map((e) => ({
            projectId: r.document.projectId,
            documentId: r.documentId,
            revisionId: r.id,
            expressId: e.expressId,
            globalId: e.globalId,
            ifcType: e.ifcType,
            name: e.name,
            typeName: e.typeName,
            storey: e.storey,
            material: e.material,
            properties: e.properties,
            quantities: e.quantities,
            minX: e.box?.[0],
            minY: e.box?.[1],
            minZ: e.box?.[2],
            maxX: e.box?.[3],
            maxY: e.box?.[4],
            maxZ: e.box?.[5],
            propsHash: e.propsHash,
          })),
          skipDuplicates: true,
        });
      }
      await this.prisma.bimProcessing.update({ where: { revisionId: r.id }, data: { status: 'DONE', elementCount: out.elements.length, storeys: out.storeys, schema: out.schema, finishedAt: new Date() } });
      this.log.log(`${r.originalFilename}: ${out.elements.length} elements in ${Date.now() - t0} ms`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`${r.originalFilename}: ${msg}`);
      await this.prisma.bimProcessing.update({ where: { revisionId: r.id }, data: { status: 'FAILED', error: msg.slice(0, 500), finishedAt: new Date() } }).catch(() => undefined);
    }
  }

  /** Read a revision again (e.g. after a failure). */
  async reprocess(projectId: string, userId: string, revisionId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const r = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, document: { projectId, deletedAt: null }, originalFilename: { endsWith: '.ifc', mode: 'insensitive' } } });
    if (!r) throw new NotFoundException('Model revision not found');
    await this.prisma.bimProcessing.deleteMany({ where: { revisionId } });
    void this.run();
    return { queued: true };
  }

  // ---- Access ----------------------------------------------------------------

  async viewer(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const client = !internal && Boolean(await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }));
    return { internal, client };
  }

  /** The newest read revision of each model (or of the ones asked for). */
  async latestRevisions(projectId: string, documentIds?: string[], clientOnly = false) {
    const docs = await this.prisma.projectDocument.findMany({
      where: { deletedAt: null, projectId, ...(documentIds?.length ? { id: { in: documentIds } } : {}), ...(clientOnly ? { clientVisible: true } : {}), revisions: { some: { originalFilename: { endsWith: '.ifc', mode: 'insensitive' } } } },
      select: {
        id: true,
        name: true,
        discipline: true,
        revisions: {
          where: { originalFilename: { endsWith: '.ifc', mode: 'insensitive' } },
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, revisionNumber: true, uploadedAt: true, bimProcessing: { select: { status: true, elementCount: true, storeys: true, schema: true, error: true, finishedAt: true } } },
        },
      },
    });
    return docs.map((d) => ({ documentId: d.id, name: d.name, discipline: d.discipline, latest: d.revisions[0], revisions: d.revisions }));
  }

  /** Elements selected by a rule, from the newest read revision of each model. */
  async selectElements(projectId: string, selection: SelectionDto | null | undefined) {
    const models = await this.latestRevisions(projectId, selection?.documentIds);
    const revisionIds = models.filter((m) => m.latest?.bimProcessing?.status === 'DONE').map((m) => m.latest.id);
    if (!revisionIds.length) return [];
    const rows = await this.prisma.bimElement.findMany({
      where: { revisionId: { in: revisionIds }, ...(selection?.ifcTypes?.length ? { ifcType: { in: selection.ifcTypes, mode: 'insensitive' } } : {}), ...(selection?.storeys?.length ? { storey: { in: selection.storeys } } : {}) },
      select: ELEMENT_LIST,
    });
    return rows.filter((e) => selects(e as ElementLike, selection));
  }

  // ---- Element browser ---------------------------------------------------------

  async elements(projectId: string, userId: string, q: ElementQuery) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('The model data is kept for the project team');
    let revisionId = q.revisionId;
    if (!revisionId) {
      const [m] = await this.latestRevisions(projectId, q.documentId ? [q.documentId] : undefined);
      revisionId = m?.latest?.id;
    }
    if (!revisionId) return { revisionId: null, total: 0, items: [], facets: { types: [], storeys: [] } };
    const rev = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, document: { projectId, deletedAt: null } }, select: { id: true } });
    if (!rev) throw new NotFoundException('Model revision not found');
    const text = q.q?.trim();
    const where = {
      revisionId,
      ...(q.ifcType ? { ifcType: { equals: q.ifcType, mode: 'insensitive' as const } } : {}),
      ...(q.storey ? { storey: q.storey } : {}),
      ...(text ? { OR: [{ name: { contains: text, mode: 'insensitive' as const } }, { typeName: { contains: text, mode: 'insensitive' as const } }, { globalId: { contains: text } }, { material: { contains: text, mode: 'insensitive' as const } }] } : {}),
    };
    const page = Math.max(0, Number(q.page ?? 0) || 0);
    const [total, items, types, storeys] = await Promise.all([
      this.prisma.bimElement.count({ where }),
      this.prisma.bimElement.findMany({ where, select: ELEMENT_LIST, orderBy: [{ ifcType: 'asc' }, { name: 'asc' }], skip: page * 100, take: 100 }),
      this.prisma.bimElement.groupBy({ by: ['ifcType'], where: { revisionId }, _count: { _all: true }, orderBy: { ifcType: 'asc' } }),
      this.prisma.bimElement.groupBy({ by: ['storey'], where: { revisionId }, _count: { _all: true }, orderBy: { storey: 'asc' } }),
    ]);
    return {
      revisionId,
      total,
      page,
      items,
      facets: { types: types.map((t) => ({ value: t.ifcType, count: t._count._all })), storeys: storeys.map((s) => ({ value: s.storey, count: s._count._all })) },
    };
  }

  /** Counts and the quantities the model carries, by type (donor "quantity
   * maps"). */
  async quantities(projectId: string, userId: string, revisionId: string) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('The model data is kept for the project team');
    const rows = await this.prisma.bimElement.findMany({ where: { revisionId, projectId }, select: { ifcType: true, storey: true, quantities: true } });
    const byType = new Map<string, { count: number; sums: Record<string, number>; storeys: Set<string> }>();
    for (const r of rows) {
      const t = byType.get(r.ifcType) ?? { count: 0, sums: {}, storeys: new Set<string>() };
      t.count++;
      if (r.storey) t.storeys.add(r.storey);
      for (const [k, v] of Object.entries((r.quantities as Record<string, number>) ?? {})) {
        const name = k.split('.').pop()!;
        if (/^(Net|Gross)?(Side|Footprint|Top|Bottom)?(Area|Volume|Length|Width|Height|Weight|Perimeter)$/i.test(name)) t.sums[name] = Math.round(((t.sums[name] ?? 0) + v) * 1000) / 1000;
      }
      byType.set(r.ifcType, t);
    }
    return [...byType.entries()].map(([type, t]) => ({ ifcType: type, count: t.count, storeys: [...t.storeys], quantities: t.sums })).sort((a, b) => b.count - a.count);
  }

  /** What changed between two revisions of a model, by GlobalId. */
  async diff(projectId: string, userId: string, documentId: string, fromRevisionId: string, toRevisionId: string) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('The model data is kept for the project team');
    const revs = await this.prisma.documentRevision.findMany({ where: { id: { in: [fromRevisionId, toRevisionId] }, documentId, document: { projectId, deletedAt: null } }, select: { id: true, revisionNumber: true } });
    if (revs.length !== 2) throw new BadRequestException('Choose two revisions of this model');
    const [a, b] = await Promise.all([fromRevisionId, toRevisionId].map((id) => this.prisma.bimElement.findMany({ where: { revisionId: id }, select: { globalId: true, ifcType: true, name: true, storey: true, propsHash: true, properties: true, minX: true, minY: true, minZ: true, maxX: true, maxY: true, maxZ: true } })));
    if (!a.length || !b.length) throw new BadRequestException('Both revisions must have been read first');
    const A = new Map(a.map((e) => [e.globalId, e]));
    const B = new Map(b.map((e) => [e.globalId, e]));
    const brief = (e: (typeof a)[number]) => ({ globalId: e.globalId, ifcType: e.ifcType, name: e.name, storey: e.storey });
    const changed: (ReturnType<typeof brief> & { what: string[] })[] = [];
    for (const [g, eb] of B) {
      const ea = A.get(g);
      if (!ea || ea.propsHash === eb.propsHash) continue;
      const what: string[] = [];
      if (ea.ifcType !== eb.ifcType) what.push('type');
      if (ea.name !== eb.name) what.push('name');
      if (ea.storey !== eb.storey) what.push('storey');
      const moved = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'].some((k) => Math.abs(((ea as any)[k] ?? 0) - ((eb as any)[k] ?? 0)) > 0.01);
      if (moved) what.push('geometry');
      const pa = (ea.properties as Record<string, unknown>) ?? {};
      const pb = (eb.properties as Record<string, unknown>) ?? {};
      const keys = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].filter((k) => JSON.stringify(pa[k]) !== JSON.stringify(pb[k]));
      if (keys.length) what.push(...keys.slice(0, 5).map((k) => `property ${k}`));
      changed.push({ ...brief(eb), what: what.length ? what : ['other'] });
    }
    return {
      from: revs.find((r) => r.id === fromRevisionId)!.revisionNumber,
      to: revs.find((r) => r.id === toRevisionId)!.revisionNumber,
      added: b.filter((e) => !A.has(e.globalId)).map(brief),
      removed: a.filter((e) => !B.has(e.globalId)).map(brief),
      changed,
      unchanged: b.length - changed.length - b.filter((e) => !A.has(e.globalId)).length,
    };
  }

  async exportElements(projectId: string, userId: string, revisionId: string) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('The model data is kept for the project team');
    const rev = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, document: { projectId, deletedAt: null } }, select: { revisionNumber: true, document: { select: { name: true } } } });
    if (!rev) throw new NotFoundException('Model revision not found');
    const rows = await this.prisma.bimElement.findMany({ where: { revisionId }, select: ELEMENT_LIST, orderBy: [{ ifcType: 'asc' }, { name: 'asc' }] });
    const props = [...new Set(rows.flatMap((r) => Object.keys((r.properties as object) ?? {})))].sort().slice(0, 150);
    const qtys = [...new Set(rows.flatMap((r) => Object.keys((r.quantities as object) ?? {})))].sort().slice(0, 50);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Setjeka Group';
    const ws = wb.addWorksheet('Elements', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
    ws.columns = [
      { header: 'GlobalId', key: 'globalId', width: 24 },
      { header: 'IFC type', key: 'ifcType', width: 22 },
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Type', key: 'typeName', width: 30 },
      { header: 'Storey', key: 'storey', width: 14 },
      { header: 'Material', key: 'material', width: 26 },
      ...qtys.map((k) => ({ header: k, key: `q:${k}`, width: 14 })),
      ...props.map((k) => ({ header: k, key: `p:${k}`, width: 18 })),
    ];
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A29' } };
    for (const r of rows) {
      const p = (r.properties as Record<string, unknown>) ?? {};
      const q = (r.quantities as Record<string, unknown>) ?? {};
      ws.addRow({ globalId: r.globalId, ifcType: r.ifcType, name: r.name, typeName: r.typeName, storey: r.storey, material: r.material, ...Object.fromEntries(qtys.map((k) => [`q:${k}`, q[k] ?? null])), ...Object.fromEntries(props.map((k) => [`p:${k}`, p[k] == null ? null : String(p[k])])) });
    }
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${rev.document.name} rev ${rev.revisionNumber} - elements.xlsx`.replace(/[^\w\- .]+/g, ' ') };
  }

  // ---- Federations ---------------------------------------------------------------

  async federations(projectId: string, userId: string) {
    await this.viewer(projectId, userId);
    return this.prisma.bimFederation.findMany({ where: { projectId }, include: { createdBy: { select: { fullName: true } } }, orderBy: { name: 'asc' } });
  }

  async saveFederation(projectId: string, userId: string, dto: FederationDto, id?: string) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('The project team keeps the federations');
    const ids = [...new Set(dto.documentIds)];
    if (ids.length < 1) throw new BadRequestException('Choose at least one model');
    const ok = await this.prisma.projectDocument.count({ where: { deletedAt: null, projectId, id: { in: ids } } });
    if (ok !== ids.length) throw new BadRequestException('Choose models from this project');
    const name = dto.name.trim();
    const clash = await this.prisma.bimFederation.findFirst({ where: { projectId, name, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new BadRequestException(`There is already a federation called "${name}"`);
    if (id) {
      const f = await this.prisma.bimFederation.findFirst({ where: { id, projectId } });
      if (!f) throw new NotFoundException('Federation not found');
      await this.prisma.bimFederation.update({ where: { id }, data: { name, documentIds: ids } });
    } else await this.prisma.bimFederation.create({ data: { projectId, name, documentIds: ids, createdById: userId } });
    return this.federations(projectId, userId);
  }

  async deleteFederation(projectId: string, userId: string, id: string) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('Not allowed');
    const f = await this.prisma.bimFederation.findFirst({ where: { id, projectId } });
    if (!f) throw new NotFoundException('Federation not found');
    await this.prisma.bimFederation.delete({ where: { id } });
    return this.federations(projectId, userId);
  }

  // ---- Coordination hub --------------------------------------------------------

  async hub(projectId: string, userId: string) {
    const { client } = await this.viewer(projectId, userId);
    if (client) throw new ForbiddenException('The coordination hub is kept for the project team');
    const [models, federations, tests, clashCounts, issueLinks, sets, smartViews, bcfIssues] = await Promise.all([
      this.latestRevisions(projectId),
      this.prisma.bimFederation.count({ where: { projectId } }),
      this.prisma.clashTest.findMany({ where: { projectId }, select: { id: true, name: true, lastRunAt: true } }),
      this.prisma.clash.groupBy({ by: ['testId', 'status'], where: { projectId }, _count: { _all: true } }),
      this.prisma.modelObjectLink.findMany({ where: { projectId, entityType: 'ISSUE' }, select: { entityId: true, documentId: true } }),
      this.prisma.bimRequirementSet.findMany({ where: { projectId }, select: { id: true, name: true, checks: { orderBy: { ranAt: 'desc' }, take: 1, select: { score: true, ranAt: true, revision: { select: { revisionNumber: true, document: { select: { name: true } } } } } } } }),
      this.prisma.smartView.count({ where: { projectId } }),
      this.prisma.projectIssue.count({ where: { projectId, bcfGuid: { not: null } } }),
    ]);
    const issues = await this.prisma.projectIssue.findMany({ where: { id: { in: issueLinks.map((l) => l.entityId) } }, select: { id: true, status: true } });
    const openIssues = issues.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
    const clashTotals = { NEW: 0, ACTIVE: 0, RESOLVED: 0, APPROVED: 0 } as Record<string, number>;
    for (const c of clashCounts) clashTotals[c.status] += c._count._all;
    return {
      models: models.map((m) => ({ documentId: m.documentId, name: m.name, discipline: m.discipline, revision: m.latest?.revisionNumber, status: m.latest?.bimProcessing?.status ?? 'QUEUED', elements: m.latest?.bimProcessing?.elementCount ?? 0, storeys: m.latest?.bimProcessing?.storeys ?? [], error: m.latest?.bimProcessing?.error ?? null, issues: issueLinks.filter((l) => l.documentId === m.documentId).length })),
      federations,
      clashes: { ...clashTotals, open: clashTotals.NEW + clashTotals.ACTIVE, tests: tests.map((t) => ({ ...t, counts: Object.fromEntries(clashCounts.filter((c) => c.testId === t.id).map((c) => [c.status, c._count._all])) })) },
      modelIssues: { total: issueLinks.length, open: openIssues },
      requirements: sets.map((s) => ({ id: s.id, name: s.name, lastScore: s.checks[0]?.score ?? null, lastRunAt: s.checks[0]?.ranAt ?? null, model: s.checks[0] ? `${s.checks[0].revision.document.name} rev ${s.checks[0].revision.revisionNumber}` : null })),
      smartViews,
      bcfIssues,
    };
  }
}
