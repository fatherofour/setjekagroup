import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { Currency } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { priceComponents, round } from './pricing.js';
import type {
  ComponentDto,
  CreateCostCodeDto,
  CreateFxRateDto,
  CreateRegionDto,
  CreateResourceDto,
  CreateWorkItemDto,
  PriceSheetDto,
  SetPriceDto,
  UpdateCostCodeDto,
  UpdateRegionDto,
  UpdateResourceDto,
  UpdateWorkItemDto,
} from './dto/cost-database.dto.js';

const RESOURCE_SELECT = { id: true, code: true, name: true, unit: true, type: true } as const;
const WORK_ITEM_INCLUDE = {
  costCode: { select: { id: true, code: true, name: true } },
  components: { include: { resource: { select: RESOURCE_SELECT } }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.WorkItemInclude;

const uniqueClash = (err: unknown, what: string): never => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException(`${what} already exists`);
  throw err;
};

/** Setjeka's cost database: titled regions, the resources priced in them,
 * and work-item build-ups. Company-wide, so internal staff only. */
@Injectable()
export class CostDatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Regions ------------------------------------------------------------

  async listRegions() {
    const regions = await this.prisma.costRegion.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { prices: true, estimates: true } } } });
    const latest = await this.prisma.resourcePrice.groupBy({ by: ['regionId'], _max: { updatedAt: true } });
    return regions.map((r) => ({ ...r, lastPriceUpdate: latest.find((l) => l.regionId === r.id)?._max.updatedAt ?? null }));
  }

  async getRegion(id: string) {
    const region = await this.prisma.costRegion.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Region not found');
    return region;
  }

  createRegion(dto: CreateRegionDto) {
    return this.prisma.costRegion.create({ data: { ...dto, name: dto.name.trim() } }).catch((e) => uniqueClash(e, 'A region with this name'));
  }

  async updateRegion(id: string, dto: UpdateRegionDto) {
    const region = await this.getRegion(id);
    if (dto.currency && dto.currency !== region.currency) {
      const priced = await this.prisma.resourcePrice.count({ where: { regionId: id } });
      if (priced) throw new BadRequestException(`This region already has ${priced} prices in ${region.currency}. Create a new region for another currency.`);
    }
    return this.prisma.costRegion.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } }).catch((e) => uniqueClash(e, 'A region with this name'));
  }

  async deleteRegion(id: string) {
    await this.getRegion(id);
    const estimates = await this.prisma.estimate.count({ where: { regionId: id } });
    if (estimates) throw new BadRequestException(`${estimates} estimate(s) are priced in this region. Deactivate it instead.`);
    await this.prisma.costRegion.delete({ where: { id } });
  }

  /** Bulk update: one call per region "price sheet" save. Only prices that
   * actually changed are written, each with a history row. */
  async savePriceSheet(regionId: string, userId: string, dto: PriceSheetDto) {
    await this.getRegion(regionId);
    const resources = await this.prisma.costResource.count({ where: { id: { in: dto.prices.map((p) => p.resourceId) } } });
    if (resources !== new Set(dto.prices.map((p) => p.resourceId)).size) throw new BadRequestException('One or more resources no longer exist');
    const changed = await this.writePrices(regionId, userId, dto.prices, dto.source, dto.effectiveDate ? new Date(dto.effectiveDate) : new Date());
    return { changed };
  }

  private async writePrices(regionId: string, userId: string, prices: { resourceId: string; rate: number }[], source: string | undefined, effectiveDate: Date, sourceRfqId?: string) {
    const existing = await this.prisma.resourcePrice.findMany({ where: { regionId, resourceId: { in: prices.map((p) => p.resourceId) } } });
    let changed = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const p of prices) {
        const prev = existing.find((e) => e.resourceId === p.resourceId);
        if (prev && prev.rate === p.rate && !sourceRfqId) continue;
        changed += 1;
        await tx.resourcePrice.upsert({
          where: { resourceId_regionId: { resourceId: p.resourceId, regionId } },
          update: { rate: p.rate, source, effectiveDate, updatedById: userId },
          create: { resourceId: p.resourceId, regionId, rate: p.rate, source, effectiveDate, updatedById: userId },
        });
        await tx.resourcePriceHistory.create({
          data: { resourceId: p.resourceId, regionId, rate: p.rate, previousRate: prev?.rate ?? null, source, effectiveDate, changedById: userId, sourceRfqId },
        });
      }
    });
    return changed;
  }

  /** Write a quote's item rates into its RFQ's region price sheet - called
   * automatically when a works/supply RFQ is awarded, or on demand for any
   * quote. Items not linked to a cost resource are skipped; a quote in
   * another currency is converted with Setjeka's recorded FX rates. */
  async applyQuoteRates(rfqId: string, quoteId: string, userId: string) {
    const rfq = await this.prisma.rfq.findUnique({ where: { id: rfqId }, include: { costRegion: true } });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (!rfq.costRegion) throw new BadRequestException('Choose the cost region this RFQ prices before updating a price sheet');
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, rfqId },
      include: { contractor: { select: { name: true } }, items: { include: { rfqItem: { include: { resource: { select: { id: true, name: true } } } } } } },
    });
    if (!quote) throw new NotFoundException('Quote not found');

    const region = rfq.costRegion;
    const convert = await this.converter(region.currency);
    const skipped: string[] = [];
    const prices: { resourceId: string; rate: number }[] = [];
    for (const qi of quote.items) {
      if (!qi.rfqItem.resource) {
        skipped.push(`${qi.rfqItem.description} (not linked to a cost resource)`);
        continue;
      }
      const rate = convert(qi.unitRate, quote.currency);
      if (rate == null) {
        skipped.push(`${qi.rfqItem.description} (no ${quote.currency} → ${region.currency} exchange rate on file)`);
        continue;
      }
      prices.push({ resourceId: qi.rfqItem.resource.id, rate: round(rate, 4) });
    }
    const updated = prices.length
      ? await this.writePrices(region.id, userId, prices, `${rfq.rfqNumber} · ${quote.contractor.name}`, new Date(), rfq.id)
      : 0;
    if (updated) await this.prisma.rfq.update({ where: { id: rfqId }, data: { pricesUpdatedAt: new Date() } });
    return { region: { id: region.id, name: region.name, currency: region.currency }, updated, skipped };
  }

  // ---- Resources ----------------------------------------------------------

  /** With a region, each resource carries its price there (or null). */
  async listResources(regionId?: string, includeInactive = false) {
    const resources = await this.prisma.costResource.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ type: 'asc' }, { category: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { components: true } },
        prices: regionId
          ? { where: { regionId }, include: { updatedBy: { select: { fullName: true } } } }
          : false,
      },
    });
    return resources.map(({ prices, ...r }) => ({ ...r, price: prices?.[0] ?? null }));
  }

  createResource(dto: CreateResourceDto) {
    return this.prisma.costResource
      .create({ data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), unit: dto.unit.trim() } })
      .catch((e) => uniqueClash(e, 'A resource with this code'));
  }

  async updateResource(id: string, dto: UpdateResourceDto) {
    await this.findResource(id);
    return this.prisma.costResource
      .update({ where: { id }, data: { ...dto, code: dto.code?.trim().toUpperCase(), name: dto.name?.trim(), unit: dto.unit?.trim() } })
      .catch((e) => uniqueClash(e, 'A resource with this code'));
  }

  async deleteResource(id: string) {
    await this.findResource(id);
    const [components, lines] = await Promise.all([
      this.prisma.workItemComponent.count({ where: { resourceId: id } }),
      this.prisma.estimateLine.count({ where: { resourceId: id } }),
    ]);
    if (components || lines) throw new BadRequestException('This resource is used in work items or estimates. Deactivate it instead.');
    await this.prisma.costResource.delete({ where: { id } });
  }

  private async findResource(id: string) {
    const r = await this.prisma.costResource.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Resource not found');
    return r;
  }

  async setPrice(resourceId: string, regionId: string, userId: string, dto: SetPriceDto) {
    await this.findResource(resourceId);
    await this.savePriceSheet(regionId, userId, { prices: [{ resourceId, rate: dto.rate }], source: dto.source, effectiveDate: dto.effectiveDate });
    return this.prisma.resourcePrice.findUnique({ where: { resourceId_regionId: { resourceId, regionId } } });
  }

  async priceHistory(resourceId: string, regionId?: string) {
    await this.findResource(resourceId);
    return this.prisma.resourcePriceHistory.findMany({
      where: { resourceId, ...(regionId ? { regionId } : {}) },
      include: { region: { select: { name: true, currency: true } }, changedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ---- Work items ---------------------------------------------------------

  /** Map of resourceId → price in the region. */
  async regionPrices(regionId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.resourcePrice.findMany({ where: { regionId }, select: { resourceId: true, rate: true } });
    return new Map(rows.map((r) => [r.resourceId, r.rate]));
  }

  async listWorkItems(regionId?: string, includeInactive = false) {
    const items = await this.prisma.workItem.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: WORK_ITEM_INCLUDE,
      orderBy: [{ code: 'asc' }],
    });
    if (!regionId) return items.map((i) => ({ ...i, priced: null }));
    const prices = await this.regionPrices(regionId);
    return items.map((i) => ({ ...i, priced: this.priceItem(i.components, prices) }));
  }

  async getWorkItem(id: string, regionId?: string) {
    const item = await this.prisma.workItem.findUnique({ where: { id }, include: WORK_ITEM_INCLUDE });
    if (!item) throw new NotFoundException('Work item not found');
    if (!regionId) return { ...item, priced: null };
    return { ...item, priced: this.priceItem(item.components, await this.regionPrices(regionId)) };
  }

  priceItem(components: { quantity: number; wastePct: number; resource: { id: string; code: string; name: string; unit: string; type: 'MATERIAL' | 'LABOUR' | 'PLANT' | 'SUBCONTRACT' | 'OTHER' } }[], prices: Map<string, number>) {
    const p = priceComponents(components, prices);
    return { ...p, rate: round(p.rate) };
  }

  private async checkComponents(components: ComponentDto[], costCodeId?: string | null) {
    const ids = [...new Set(components.map((c) => c.resourceId))];
    if (ids.length !== components.length) throw new BadRequestException('Each resource can appear only once in a build-up');
    const found = await this.prisma.costResource.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('One or more resources no longer exist');
    if (costCodeId && !(await this.prisma.costCode.findUnique({ where: { id: costCodeId } }))) throw new BadRequestException('Cost code not found');
  }

  private componentRows(components: ComponentDto[]) {
    return components.map((c, i) => ({ resourceId: c.resourceId, quantity: c.quantity, wastePct: c.wastePct ?? 0, notes: c.notes, sortOrder: i }));
  }

  private keywords(k?: string[]) {
    return k ? [...new Set(k.map((s) => s.trim()).filter(Boolean))] : undefined;
  }

  async createWorkItem(dto: CreateWorkItemDto) {
    await this.checkComponents(dto.components, dto.costCodeId);
    return this.prisma.workItem
      .create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          unit: dto.unit.trim(),
          description: dto.description,
          costCodeId: dto.costCodeId,
          takeoffBasis: dto.takeoffBasis,
          takeoffKeywords: this.keywords(dto.takeoffKeywords) ?? [],
          components: { create: this.componentRows(dto.components) },
        },
        include: WORK_ITEM_INCLUDE,
      })
      .catch((e) => uniqueClash(e, 'A work item with this code'));
  }

  async updateWorkItem(id: string, dto: UpdateWorkItemDto) {
    await this.getWorkItem(id);
    if (dto.components) await this.checkComponents(dto.components, dto.costCodeId);
    const { components, ...rest } = dto;
    return this.prisma
      .$transaction(async (tx) => {
        if (components) {
          await tx.workItemComponent.deleteMany({ where: { workItemId: id } });
          await tx.workItemComponent.createMany({ data: this.componentRows(components).map((c) => ({ ...c, workItemId: id })) });
        }
        return tx.workItem.update({
          where: { id },
          data: {
            ...rest,
            code: rest.code?.trim().toUpperCase(),
            name: rest.name?.trim(),
            unit: rest.unit?.trim(),
            takeoffKeywords: this.keywords(rest.takeoffKeywords),
          },
          include: WORK_ITEM_INCLUDE,
        });
      })
      .catch((e) => uniqueClash(e, 'A work item with this code'));
  }

  async deleteWorkItem(id: string) {
    await this.getWorkItem(id);
    const used = await this.prisma.estimateLine.count({ where: { workItemId: id } });
    if (used) throw new BadRequestException(`Used on ${used} estimate line(s). Deactivate it instead.`);
    await this.prisma.workItem.delete({ where: { id } });
  }

  // ---- Cost codes ---------------------------------------------------------

  listCostCodes(includeInactive = false) {
    return this.prisma.costCode.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  }

  createCostCode(dto: CreateCostCodeDto) {
    return this.prisma.costCode.create({ data: { ...dto, code: dto.code.trim() } }).catch((e) => uniqueClash(e, 'A cost code with this code'));
  }

  async updateCostCode(id: string, dto: UpdateCostCodeDto) {
    if (!(await this.prisma.costCode.findUnique({ where: { id } }))) throw new NotFoundException('Cost code not found');
    return this.prisma.costCode.update({ where: { id }, data: dto });
  }

  // ---- FX -----------------------------------------------------------------

  listFxRates() {
    return this.prisma.fxRate.findMany({ include: { enteredBy: { select: { fullName: true } } }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], take: 300 });
  }

  createFxRate(userId: string, dto: CreateFxRateDto) {
    if (dto.fromCurrency === dto.toCurrency) throw new BadRequestException('Choose two different currencies');
    return this.prisma.fxRate.create({ data: { ...dto, effectiveDate: new Date(dto.effectiveDate), enteredById: userId } });
  }

  async deleteFxRate(id: string) {
    if (!(await this.prisma.fxRate.findUnique({ where: { id } }))) throw new NotFoundException('Rate not found');
    await this.prisma.fxRate.delete({ where: { id } });
  }

  /** A converter from any currency into `to`, using the latest rate on or
   * before `asOf` (direct, or the inverse of the opposite pair). Returns
   * null for a pair with no rate on file, so callers can say so rather
   * than add unconverted amounts together. */
  async converter(to: Currency, asOf = new Date()) {
    const rates = await this.prisma.fxRate.findMany({
      where: { effectiveDate: { lte: asOf }, OR: [{ toCurrency: to }, { fromCurrency: to }] },
      orderBy: { effectiveDate: 'desc' },
    });
    return (amount: number, from: Currency): number | null => {
      if (from === to) return amount;
      const direct = rates.find((r) => r.fromCurrency === from && r.toCurrency === to);
      if (direct) return amount * direct.rate;
      const inverse = rates.find((r) => r.fromCurrency === to && r.toCurrency === from);
      if (inverse) return amount / inverse.rate;
      return null;
    };
  }
}
