import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { TakeoffBasis } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CostDatabaseService } from '../cost-database/cost-database.service.js';
import { matchesKeywords, priceComponents, round, totalEstimate, type LineInput, type PricedItem } from '../cost-database/pricing.js';
import { ConverterClient, MODEL_EXTENSIONS, type ModelGroup, type ModelGroupItem } from './converter.client.js';
import type { ApplyTakeoffDto, CreateEstimateDto, CreateLineDto, UpdateEstimateDto, UpdateLineDto } from './dto/estimate.dto.js';

const RESOURCE_SELECT = { id: true, code: true, name: true, unit: true, type: true } as const;
const CODE_SELECT = { id: true, code: true, name: true } as const;

const ESTIMATE_INCLUDE = {
  region: true,
  project: { select: { id: true, name: true, projectCode: true, currency: true } },
  opportunity: { select: { id: true, name: true } },
  createdBy: { select: { fullName: true } },
  lines: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      costCode: { select: CODE_SELECT },
      resource: { select: RESOURCE_SELECT },
      workItem: { include: { components: { include: { resource: { select: RESOURCE_SELECT } }, orderBy: { sortOrder: 'asc' } } } },
    },
  },
  takeoffs: { select: { id: true, fileName: true, format: true, totalElements: true, createdAt: true, createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.EstimateInclude;

type EstimateRow = Prisma.EstimateGetPayload<{ include: typeof ESTIMATE_INCLUDE }>;
type LineRow = EstimateRow['lines'][number];

const QUANTITY_FIELD: Record<TakeoffBasis, keyof Pick<ModelGroupItem, 'area_m2' | 'volume_m3' | 'length_m' | 'count'>> = {
  AREA: 'area_m2',
  VOLUME: 'volume_m3',
  LENGTH: 'length_m',
  COUNT: 'count',
};

/** Rough cost estimates and BOQs priced from one region's price sheet.
 * Lines are work items (priced from their build-up), single resources, or
 * lump sums; the material schedule multiplies every build-up out. */
@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostDatabaseService,
    private readonly converter: ConverterClient,
  ) {}

  private async nextReference() {
    const prefix = `EST-${new Date().getFullYear()}-`;
    const latest = await this.prisma.estimate.findFirst({ where: { reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } });
    const seq = latest ? Number.parseInt(latest.reference.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async load(id: string) {
    const e = await this.prisma.estimate.findUnique({ where: { id }, include: ESTIMATE_INCLUDE });
    if (!e) throw new NotFoundException('Estimate not found');
    return e;
  }

  private assertDraft(e: { status: string }) {
    if (e.status === 'FINAL') throw new BadRequestException('This estimate is final. Reopen it to make changes.');
  }

  /** A line's priced build-up: frozen when the estimate is final,
   * otherwise from today's regional prices. */
  private pricedLine(l: LineRow, prices: Map<string, number>, final: boolean): PricedItem | null {
    if (final && l.frozenBreakdown) return l.frozenBreakdown as unknown as PricedItem;
    if (l.kind === 'WORK_ITEM' && l.workItem) return priceComponents(l.workItem.components, prices);
    if (l.kind === 'RESOURCE' && l.resource) return priceComponents([{ resource: l.resource, quantity: 1, wastePct: 0 }], prices);
    return null;
  }

  private compute(e: EstimateRow, prices: Map<string, number>) {
    const final = e.status === 'FINAL';
    const inputs: LineInput[] = e.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      lumpSum: l.lumpSum,
      rateOverride: l.rateOverride,
      costCode: l.costCode,
      priced: this.pricedLine(l, prices, final),
    }));
    const totals = totalEstimate(inputs, e);
    const byLine = new Map(totals.lines.map((p) => [p.id, p]));
    return {
      lines: e.lines.map((l, i) => ({
        id: l.id,
        kind: l.kind,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        lumpSum: l.lumpSum,
        rateOverride: l.rateOverride,
        source: l.source,
        sourceRef: l.sourceRef,
        costCode: l.costCode,
        workItem: l.workItem ? { id: l.workItem.id, code: l.workItem.code, name: l.workItem.name, unit: l.workItem.unit } : null,
        resource: l.resource,
        breakdown: inputs[i].priced?.breakdown ?? [],
        rate: byLine.get(l.id)!.rate,
        amount: byLine.get(l.id)!.amount,
        computedRate: byLine.get(l.id)!.computedRate,
        overridden: byLine.get(l.id)!.overridden,
        missing: byLine.get(l.id)!.missing,
      })),
      summary: {
        worksTotal: round(totals.worksTotal),
        preliminaries: round(totals.preliminaries),
        overheadProfit: round(totals.overheadProfit),
        contingency: round(totals.contingency),
        totalExclVat: round(totals.totalExclVat),
        vat: round(totals.vat),
        totalInclVat: round(totals.totalInclVat),
        costPerSqm: e.grossFloorArea ? round(totals.totalExclVat / e.grossFloorArea) : null,
        byCostCode: totals.byCostCode.map((c) => ({ ...c, amount: round(c.amount) })),
        byType: Object.fromEntries(Object.entries(totals.byType).map(([k, v]) => [k, round(v)])),
        missingPrices: totals.missingPrices,
      },
      schedule: totals.schedule.map((s) => ({ ...s, quantity: round(s.quantity, 3), amount: round(s.amount) })),
    };
  }

  private shape(e: EstimateRow, computed: ReturnType<EstimatesService['compute']>) {
    const { lines: _lines, ...rest } = e;
    return { ...rest, currency: e.region.currency, ...computed };
  }

  async get(id: string) {
    const e = await this.load(id);
    const prices = e.status === 'FINAL' ? new Map<string, number>() : await this.costs.regionPrices(e.regionId);
    return this.shape(e, this.compute(e, prices));
  }

  async list(filter: { projectId?: string; opportunityId?: string }) {
    const rows = await this.prisma.estimate.findMany({
      where: { ...(filter.projectId ? { projectId: filter.projectId } : {}), ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}) },
      include: ESTIMATE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    const priceCache = new Map<string, Map<string, number>>();
    const out = [];
    for (const e of rows) {
      if (!priceCache.has(e.regionId)) priceCache.set(e.regionId, await this.costs.regionPrices(e.regionId));
      const c = this.compute(e, priceCache.get(e.regionId)!);
      const { lines: _l, takeoffs: _t, ...rest } = e;
      out.push({ ...rest, currency: e.region.currency, lineCount: e.lines.length, summary: c.summary });
    }
    return out;
  }

  private async checkOwners(dto: { projectId?: string; opportunityId?: string }) {
    if (dto.projectId && dto.opportunityId) throw new BadRequestException('An estimate belongs to a project or an opportunity, not both');
    if (dto.projectId && !(await this.prisma.project.findUnique({ where: { id: dto.projectId } }))) throw new BadRequestException('Project not found');
    if (dto.opportunityId && !(await this.prisma.opportunity.findUnique({ where: { id: dto.opportunityId } }))) throw new BadRequestException('Opportunity not found');
  }

  async create(userId: string, dto: CreateEstimateDto) {
    await this.checkOwners(dto);
    const region = await this.costs.getRegion(dto.regionId);
    if (!region.isActive) throw new BadRequestException('That region is inactive');
    const e = await this.prisma.estimate.create({ data: { ...dto, name: dto.name.trim(), reference: await this.nextReference(), createdById: userId } });
    return this.get(e.id);
  }

  async update(id: string, dto: UpdateEstimateDto) {
    const e = await this.load(id);
    const pricingChange = Object.keys(dto).some((k) => !['name', 'description'].includes(k));
    if (pricingChange) this.assertDraft(e);
    if (dto.regionId) await this.costs.getRegion(dto.regionId);
    await this.prisma.estimate.update({ where: { id }, data: dto });
    return this.get(id);
  }

  async remove(id: string) {
    await this.load(id);
    await this.prisma.estimate.delete({ where: { id } });
  }

  // ---- Lines --------------------------------------------------------------

  async addLine(id: string, dto: CreateLineDto) {
    const e = await this.load(id);
    this.assertDraft(e);
    let description = dto.description?.trim();
    let unit = dto.unit?.trim() || null;
    let costCodeId = dto.costCodeId ?? null;

    if (dto.kind === 'WORK_ITEM') {
      if (!dto.workItemId) throw new BadRequestException('Choose a work item');
      const w = await this.prisma.workItem.findUnique({ where: { id: dto.workItemId } });
      if (!w) throw new BadRequestException('Work item not found');
      description ||= w.name;
      unit = w.unit;
      costCodeId ??= w.costCodeId;
    } else if (dto.kind === 'RESOURCE') {
      if (!dto.resourceId) throw new BadRequestException('Choose a resource');
      const r = await this.prisma.costResource.findUnique({ where: { id: dto.resourceId } });
      if (!r) throw new BadRequestException('Resource not found');
      description ||= r.name;
      unit = r.unit;
    } else {
      if (!description) throw new BadRequestException('Describe the lump sum');
      if (dto.lumpSum == null) throw new BadRequestException('Enter the lump-sum amount');
    }
    if (costCodeId && !(await this.prisma.costCode.findUnique({ where: { id: costCodeId } }))) throw new BadRequestException('Cost code not found');

    const sortOrder = (await this.prisma.estimateLine.count({ where: { estimateId: id } })) * 10;
    await this.prisma.estimateLine.create({
      data: {
        estimateId: id,
        kind: dto.kind,
        workItemId: dto.kind === 'WORK_ITEM' ? dto.workItemId : null,
        resourceId: dto.kind === 'RESOURCE' ? dto.resourceId : null,
        costCodeId,
        description: description!,
        unit,
        quantity: dto.kind === 'LUMP_SUM' ? 1 : (dto.quantity ?? 0),
        lumpSum: dto.kind === 'LUMP_SUM' ? dto.lumpSum : null,
        rateOverride: dto.kind === 'LUMP_SUM' ? null : (dto.rateOverride ?? null),
        sortOrder,
      },
    });
    return this.get(id);
  }

  private async line(estimateId: string, lineId: string) {
    const l = await this.prisma.estimateLine.findFirst({ where: { id: lineId, estimateId } });
    if (!l) throw new NotFoundException('Line not found');
    return l;
  }

  async updateLine(id: string, lineId: string, dto: UpdateLineDto) {
    this.assertDraft(await this.load(id));
    const l = await this.line(id, lineId);
    if (dto.costCodeId && !(await this.prisma.costCode.findUnique({ where: { id: dto.costCodeId } }))) throw new BadRequestException('Cost code not found');
    await this.prisma.estimateLine.update({
      where: { id: l.id },
      data: {
        costCodeId: dto.costCodeId,
        description: dto.description?.trim(),
        unit: l.kind === 'LUMP_SUM' ? dto.unit : undefined,
        quantity: l.kind === 'LUMP_SUM' ? undefined : dto.quantity,
        lumpSum: l.kind === 'LUMP_SUM' ? dto.lumpSum : undefined,
        rateOverride: l.kind === 'LUMP_SUM' ? undefined : dto.rateOverride,
      },
    });
    return this.get(id);
  }

  async removeLine(id: string, lineId: string) {
    this.assertDraft(await this.load(id));
    await this.line(id, lineId);
    await this.prisma.estimateLine.delete({ where: { id: lineId } });
    return this.get(id);
  }

  // ---- Final / reopen -----------------------------------------------------

  /** Freezes every line's rate and build-up at today's prices, so later
   * price updates in the region don't move a final estimate. */
  async finalise(id: string) {
    const e = await this.load(id);
    this.assertDraft(e);
    if (!e.lines.length) throw new BadRequestException('Add at least one line before finalising');
    const prices = await this.costs.regionPrices(e.regionId);
    await this.prisma.$transaction([
      ...e.lines.map((l) => {
        const priced = this.pricedLine(l, prices, false);
        return this.prisma.estimateLine.update({
          where: { id: l.id },
          data: { frozenRate: priced ? priced.rate : null, frozenBreakdown: priced ? (priced as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
        });
      }),
      this.prisma.estimate.update({ where: { id }, data: { status: 'FINAL', finalisedAt: new Date() } }),
    ]);
    return this.get(id);
  }

  async reopen(id: string) {
    const e = await this.load(id);
    if (e.status !== 'FINAL') throw new BadRequestException('This estimate is already a draft');
    await this.prisma.$transaction([
      this.prisma.estimateLine.updateMany({ where: { estimateId: id }, data: { frozenRate: null, frozenBreakdown: Prisma.DbNull } }),
      this.prisma.estimate.update({ where: { id }, data: { status: 'DRAFT', finalisedAt: null } }),
    ]);
    return this.get(id);
  }

  // ---- BIM / CAD takeoff ---------------------------------------------------

  converterStatus() {
    return this.converter.status();
  }

  async uploadModel(id: string, userId: string, file: Express.Multer.File | undefined) {
    const e = await this.load(id);
    this.assertDraft(e);
    if (!file) throw new BadRequestException('Choose a model or drawing file');
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!MODEL_EXTENSIONS.includes(ext)) throw new BadRequestException(`Upload one of: ${MODEL_EXTENSIONS.map((x) => `.${x}`).join(', ')}`);
    const model = await this.converter.convert(file.originalname, file.buffer);
    const takeoff = await this.prisma.modelTakeoff.create({
      data: {
        estimateId: id,
        fileName: file.originalname,
        format: model.format,
        totalElements: model.total_elements,
        groups: model.groups as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    return this.getTakeoff(id, takeoff.id);
  }

  /** The model's quantity groups, each with the work items whose takeoff
   * keywords match it and a suggested quantity basis. */
  async getTakeoff(id: string, takeoffId: string) {
    const t = await this.prisma.modelTakeoff.findFirst({ where: { id: takeoffId, estimateId: id }, include: { lines: { select: { workItemId: true, sourceRef: true } } } });
    if (!t) throw new NotFoundException('Takeoff not found');
    const items = await this.prisma.workItem.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, unit: true, takeoffBasis: true, takeoffKeywords: true } });
    const groups = t.groups as unknown as ModelGroup[];
    const added = new Set(t.lines.map((l) => `${l.sourceRef}|${l.workItemId}`));
    return {
      id: t.id,
      fileName: t.fileName,
      format: t.format,
      totalElements: t.totalElements,
      createdAt: t.createdAt,
      groups: groups.map((g) => ({
        category: g.category,
        totals: g.totals,
        items: g.items.map((it) => {
          const ref = `${g.category} / ${it.type}`;
          return {
            ...it,
            ref,
            suggestedBasis: it.volume_m3 > 0 ? 'VOLUME' : it.area_m2 > 0 ? 'AREA' : it.length_m > 0 ? 'LENGTH' : 'COUNT',
            suggestions: items
              .filter((w) => matchesKeywords(w.takeoffKeywords, g.category, it.type, it.material))
              .map((w) => ({ ...w, alreadyAdded: added.has(`${ref}|${w.id}`) })),
          };
        }),
      })),
    };
  }

  /** Turn chosen model groups into estimate lines: quantity = the group's
   * area / volume / length / count × factor. */
  async applyTakeoff(id: string, takeoffId: string, dto: ApplyTakeoffDto) {
    const e = await this.load(id);
    this.assertDraft(e);
    const t = await this.prisma.modelTakeoff.findFirst({ where: { id: takeoffId, estimateId: id } });
    if (!t) throw new NotFoundException('Takeoff not found');
    const groups = t.groups as unknown as ModelGroup[];
    const workItems = await this.prisma.workItem.findMany({ where: { id: { in: dto.rows.map((r) => r.workItemId) } } });

    let sortOrder = e.lines.length * 10;
    const data: Prisma.EstimateLineCreateManyInput[] = [];
    for (const r of dto.rows) {
      const item = groups.find((g) => g.category === r.category)?.items.find((i) => i.type === r.type);
      if (!item) throw new BadRequestException(`"${r.category} / ${r.type}" isn't in this model`);
      const w = workItems.find((x) => x.id === r.workItemId);
      if (!w) throw new BadRequestException('Work item not found');
      const quantity = round(item[QUANTITY_FIELD[r.basis]] * (r.factor ?? 1), 3);
      if (quantity <= 0) throw new BadRequestException(`"${r.type}" has no ${r.basis.toLowerCase()} in the model; pick another basis`);
      sortOrder += 10;
      data.push({
        estimateId: id,
        kind: 'WORK_ITEM',
        workItemId: w.id,
        costCodeId: w.costCodeId,
        description: `${w.name} — ${item.type}`,
        unit: w.unit,
        quantity,
        source: 'MODEL',
        sourceRef: `${r.category} / ${r.type}`,
        takeoffId,
        sortOrder,
      });
    }
    await this.prisma.estimateLine.createMany({ data });
    return this.get(id);
  }

  async removeTakeoff(id: string, takeoffId: string) {
    const t = await this.prisma.modelTakeoff.findFirst({ where: { id: takeoffId, estimateId: id } });
    if (!t) throw new NotFoundException('Takeoff not found');
    await this.prisma.modelTakeoff.delete({ where: { id: takeoffId } });
  }

  // ---- Adopt as budget ------------------------------------------------------

  /** Replace the project's draft budget with this estimate: works by cost
   * code, preliminaries on 01, overheads & profit spread pro rata over the
   * works, and the estimate's contingency as the budget contingency. VAT
   * is left out - the budget tracks cost. */
  async adoptAsBudget(id: string) {
    const e = await this.get(id);
    if (!e.projectId) throw new BadRequestException('Link the estimate to a project first');
    if (e.status !== 'FINAL') throw new BadRequestException('Finalise the estimate before adopting it as the budget');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: e.projectId } });
    if (project.currency !== e.currency) {
      throw new BadRequestException(`The estimate is in ${e.currency} but the project budget is in ${project.currency}. Price it in a ${project.currency} region.`);
    }
    const budget = await this.prisma.projectBudget.findUnique({ where: { projectId: e.projectId } });
    if (budget?.lockedAt) throw new BadRequestException('The project budget is locked; changes now come through variations');

    const { summary } = e;
    const coded = summary.byCostCode.filter((c) => c.amount !== 0);
    if (coded.some((c) => !c.costCodeId)) throw new BadRequestException('Give every line a cost code before adopting the estimate');
    const prelimCode = await this.prisma.costCode.findUnique({ where: { code: '01' } });
    if (summary.preliminaries && !prelimCode) throw new BadRequestException('Cost code 01 (preliminaries) is missing');
    const works = summary.worksTotal || 1;

    const lines: { costCodeId: string; description: string; amount: number }[] = coded.map((c) => ({
      costCodeId: c.costCodeId!,
      description: `From ${e.reference}`,
      amount: round(c.amount + (summary.overheadProfit * c.amount) / works),
    }));
    if (summary.preliminaries) lines.push({ costCodeId: prelimCode!.id, description: `Preliminaries from ${e.reference}`, amount: summary.preliminaries });

    await this.prisma.$transaction([
      this.prisma.budgetLine.deleteMany({ where: { projectId: e.projectId } }),
      this.prisma.budgetLine.createMany({ data: lines.map((l) => ({ ...l, projectId: e.projectId! })) }),
      this.prisma.projectBudget.upsert({
        where: { projectId: e.projectId },
        update: { contingencyAmount: summary.contingency, sourceEstimateId: id },
        create: { projectId: e.projectId, contingencyAmount: summary.contingency, sourceEstimateId: id },
      }),
    ]);
    return { projectId: e.projectId, lines: lines.length, contingency: summary.contingency };
  }
}
