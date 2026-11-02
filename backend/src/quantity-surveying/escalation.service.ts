import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { QsAccessService } from './qs-access.service.js';
import { priceAdjustment } from './qs-math.js';
import type { ContractEscalationDto, IndexValuesDto, PriceIndexDto } from './dto/qs.dto.js';

/** The first of a month, from a date or "YYYY-MM". */
export function monthStart(d: Date | string): Date {
  if (typeof d === 'string' && /^\d{4}-\d{2}$/.test(d)) return new Date(`${d}-01T00:00:00.000Z`);
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
}
const CERTIFIED = ['CERTIFIED', 'APPROVED', 'PAID'] as const;
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const monthLabel = (d: Date) => d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' });

interface LineLike {
  valueToDate: number;
  dayworkSheetId: string | null;
}

/** Contract price adjustment (CPAP, as JBCC and GCC use it): the work done in
 * each valuation period, less the fixed share, moves with the weighted
 * indices from the base month to the valuation month (less the lag).
 * Dayworks are already at current prices and aren't adjusted. */
@Injectable()
export class EscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QsAccessService,
  ) {}

  // ---- Indices (one set for every project) ---------------------------------------

  async indices(projectId: string, userId: string) {
    const a = await this.access.of(projectId, userId);
    if (!a.internal && !a.qs) throw new ForbiddenException('Only the quantity surveyor or Setjeka sees the price indices');
    return this.prisma.priceIndex.findMany({ orderBy: { code: 'asc' }, include: { values: { orderBy: { month: 'asc' }, select: { month: true, value: true } } } });
  }

  async createIndex(projectId: string, userId: string, dto: PriceIndexDto) {
    this.access.preparer(await this.access.of(projectId, userId));
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.priceIndex.findUnique({ where: { code } })) throw new BadRequestException(`There is already an index ${code}`);
    return this.prisma.priceIndex.create({ data: { code, name: dto.name.trim(), source: dto.source?.trim() || null }, include: { values: true } });
  }

  /** Enter or correct monthly values. */
  async setValues(projectId: string, userId: string, id: string, dto: IndexValuesDto) {
    this.access.preparer(await this.access.of(projectId, userId));
    if (!(await this.prisma.priceIndex.findUnique({ where: { id } }))) throw new NotFoundException('Index not found');
    await this.prisma.$transaction(
      dto.values.map((v) => {
        const month = monthStart(v.month);
        return this.prisma.priceIndexValue.upsert({ where: { indexId_month: { indexId: id, month } }, create: { indexId: id, month, value: v.value }, update: { value: v.value } });
      }),
    );
    return this.prisma.priceIndex.findUniqueOrThrow({ where: { id }, include: { values: { orderBy: { month: 'asc' }, select: { month: true, value: true } } } });
  }

  // ---- A contract's price adjustment ----------------------------------------------

  async setContract(projectId: string, userId: string, contractId: string, dto: ContractEscalationDto) {
    this.access.preparer(await this.access.of(projectId, userId));
    const c = await this.prisma.projectContract.findFirst({ where: { id: contractId, projectId } });
    if (!c) throw new NotFoundException('Contract not found');
    if (await this.prisma.valuation.count({ where: { contractId, status: { in: [...CERTIFIED] } } })) {
      throw new BadRequestException('A valuation on this contract has been certified, so its price adjustment is fixed');
    }
    if (dto.weights.length) {
      if (!dto.baseMonth) throw new BadRequestException('Give the base month the tender was priced at');
      const total = dto.weights.reduce((s, w) => s + w.weight, 0);
      if (Math.abs(total - 1) > 0.0005) throw new BadRequestException(`The weightings add to ${Math.round(total * 1000) / 1000}; they must add to 1`);
      if (new Set(dto.weights.map((w) => w.indexId)).size !== dto.weights.length) throw new BadRequestException('Each index can be weighted once');
      const found = await this.prisma.priceIndex.count({ where: { id: { in: dto.weights.map((w) => w.indexId) } } });
      if (found !== dto.weights.length) throw new BadRequestException('An index is not on the list');
    }
    await this.prisma.$transaction([
      this.prisma.contractEscalationWeight.deleteMany({ where: { contractId } }),
      this.prisma.contractEscalationWeight.createMany({ data: dto.weights.filter((w) => w.weight > 0).map((w) => ({ contractId, indexId: w.indexId, weight: w.weight })) }),
      this.prisma.projectContract.update({
        where: { id: contractId },
        data: {
          escalationBaseMonth: dto.weights.length && dto.baseMonth ? monthStart(dto.baseMonth) : null,
          ...(dto.fixedPct !== undefined && { escalationFixedPct: dto.fixedPct }),
          ...(dto.lagMonths !== undefined && { escalationLagMonths: dto.lagMonths }),
        },
      }),
    ]);
    return this.config(projectId, userId, contractId);
  }

  async config(projectId: string, userId: string, contractId: string) {
    const a = await this.access.of(projectId, userId);
    if (!a.internal && !a.qs && !a.client) throw new NotFoundException('Contract not found');
    const c = await this.prisma.projectContract.findFirst({
      where: { id: contractId, projectId },
      select: { escalationBaseMonth: true, escalationFixedPct: true, escalationLagMonths: true, escalationWeights: { include: { index: { select: { id: true, code: true, name: true } } } } },
    });
    if (!c) throw new NotFoundException('Contract not found');
    return {
      baseMonth: c.escalationBaseMonth,
      fixedPct: c.escalationFixedPct,
      lagMonths: c.escalationLagMonths,
      weights: c.escalationWeights.map((w) => ({ indexId: w.indexId, code: w.index.code, name: w.index.name, weight: w.weight })),
    };
  }

  /** The adjustment to date for a draft valuation: the last certified
   * valuation's, plus this period's. */
  async forValuation(v: { contractId: string; valuationDate: Date; lines: LineLike[] }, prev: { escalationToDate: number; lines: LineLike[] } | null): Promise<{ toDate: number; note: string | null }> {
    const carried = prev?.escalationToDate ?? 0;
    const c = await this.prisma.projectContract.findUniqueOrThrow({
      where: { id: v.contractId },
      select: { escalationBaseMonth: true, escalationFixedPct: true, escalationLagMonths: true, escalationWeights: { include: { index: { select: { code: true } } } } },
    });
    if (!c.escalationWeights.length || !c.escalationBaseMonth) return { toDate: carried, note: null };
    const adjustable = (ls: LineLike[]) => ls.filter((l) => !l.dayworkSheetId).reduce((s, l) => s + l.valueToDate, 0);
    const period = adjustable(v.lines) - (prev ? adjustable(prev.lines) : 0);
    const base = c.escalationBaseMonth;
    const month = addMonths(monthStart(v.valuationDate), -c.escalationLagMonths);
    const parts: { weight: number; base: number; current: number }[] = [];
    const provisional: string[] = [];
    for (const w of c.escalationWeights) {
      const [b0, cur] = await Promise.all([
        this.prisma.priceIndexValue.findUnique({ where: { indexId_month: { indexId: w.indexId, month: base } } }),
        this.prisma.priceIndexValue.findFirst({ where: { indexId: w.indexId, month: { lte: month } }, orderBy: { month: 'desc' } }),
      ]);
      if (!b0) return { toDate: carried, note: `No ${w.index.code} index for the base month, ${monthLabel(base)}: no adjustment this period` };
      if (!cur) return { toDate: carried, note: `No ${w.index.code} index up to ${monthLabel(month)}: no adjustment this period` };
      if (cur.month.getTime() !== month.getTime()) provisional.push(`${w.index.code} ${monthLabel(cur.month)}`);
      parts.push({ weight: w.weight, base: b0.value, current: cur.value });
    }
    const p = priceAdjustment(period, c.escalationFixedPct, parts);
    const note =
      `On ${period.toLocaleString('en-ZA', { maximumFractionDigits: 2 })} of work this period, factor ${p.factor.toFixed(4)} ` +
      `(indices for ${monthLabel(month)} against ${monthLabel(base)}, ${c.escalationFixedPct}% fixed)` +
      (provisional.length ? `; provisional, latest published used: ${provisional.join(', ')}` : '');
    return { toDate: Math.round((carried + p.amount) * 100) / 100, note };
  }
}
