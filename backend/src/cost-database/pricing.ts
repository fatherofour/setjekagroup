/** The automated-QS arithmetic, kept free of the database so it can be
 * reasoned about (and tested) on its own.
 *
 * A work item's rate in a region is the sum of its components:
 *   rate = Σ quantity × (1 + waste%) × regional price
 * and an estimate's material schedule is every component quantity
 * multiplied out by the line quantity - "how many blocks, how many bags of
 * cement" - priced at the same regional rates. */

export type ResourceType = 'MATERIAL' | 'LABOUR' | 'PLANT' | 'SUBCONTRACT' | 'OTHER';

export interface ResourceRef {
  id: string;
  code: string;
  name: string;
  unit: string;
  type: ResourceType;
}

export interface ComponentInput {
  resource: ResourceRef;
  quantity: number;
  wastePct: number;
}

export interface BreakdownEntry {
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  type: ResourceType;
  /** Per one unit of the work item, waste included. */
  quantityPerUnit: number;
  price: number | null;
  amountPerUnit: number;
}

export interface PricedItem {
  rate: number;
  breakdown: BreakdownEntry[];
  /** Names of components with no price in the region (counted as 0). */
  missing: string[];
}

export const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export function priceComponents(components: ComponentInput[], prices: Map<string, number>): PricedItem {
  const breakdown: BreakdownEntry[] = [];
  const missing: string[] = [];
  let rate = 0;
  for (const c of components) {
    const price = prices.get(c.resource.id) ?? null;
    const quantityPerUnit = c.quantity * (1 + (c.wastePct || 0) / 100);
    const amountPerUnit = price == null ? 0 : quantityPerUnit * price;
    if (price == null) missing.push(c.resource.name);
    rate += amountPerUnit;
    breakdown.push({
      resourceId: c.resource.id,
      code: c.resource.code,
      name: c.resource.name,
      unit: c.resource.unit,
      type: c.resource.type,
      quantityPerUnit,
      price,
      amountPerUnit,
    });
  }
  return { rate, breakdown, missing };
}

export interface LineInput {
  id: string;
  kind: 'WORK_ITEM' | 'RESOURCE' | 'LUMP_SUM';
  description: string;
  unit: string | null;
  quantity: number;
  lumpSum: number | null;
  rateOverride: number | null;
  costCode: { id: string; code: string; name: string } | null;
  /** A work item's priced build-up, or a single-resource "build-up" of
   * quantity 1 for a resource line. Null for a lump sum. */
  priced: PricedItem | null;
}

export interface PricedLine {
  id: string;
  rate: number | null;
  amount: number;
  computedRate: number | null;
  overridden: boolean;
  missing: string[];
}

export interface ScheduleRow {
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  type: ResourceType;
  quantity: number;
  price: number | null;
  amount: number;
}

export interface Markups {
  preliminariesPct: number;
  overheadProfitPct: number;
  contingencyPct: number;
  vatPct: number;
}

export interface EstimateTotals {
  lines: PricedLine[];
  worksTotal: number;
  preliminaries: number;
  overheadProfit: number;
  contingency: number;
  totalExclVat: number;
  vat: number;
  totalInclVat: number;
  byCostCode: { costCodeId: string | null; code: string | null; name: string; amount: number }[];
  byType: Record<ResourceType | 'LUMP_SUM' | 'OVERRIDDEN', number>;
  schedule: ScheduleRow[];
  missingPrices: string[];
}

/** Price every line, roll up the markups in the usual QS order (works →
 * preliminaries on works → overheads & profit on works + prelims →
 * contingency on all of that → VAT), and multiply out the material
 * schedule. */
export function totalEstimate(lines: LineInput[], markups: Markups): EstimateTotals {
  const priced: PricedLine[] = [];
  const byCode = new Map<string, { costCodeId: string | null; code: string | null; name: string; amount: number }>();
  const byType: EstimateTotals['byType'] = { MATERIAL: 0, LABOUR: 0, PLANT: 0, SUBCONTRACT: 0, OTHER: 0, LUMP_SUM: 0, OVERRIDDEN: 0 };
  const schedule = new Map<string, ScheduleRow>();
  const missing = new Set<string>();
  let worksTotal = 0;

  for (const l of lines) {
    let rate: number | null = null;
    let amount = 0;
    const computedRate = l.priced ? l.priced.rate : null;
    const overridden = l.kind !== 'LUMP_SUM' && l.rateOverride != null;

    if (l.kind === 'LUMP_SUM') {
      amount = l.lumpSum ?? 0;
      byType.LUMP_SUM += amount;
    } else {
      rate = overridden ? l.rateOverride! : (computedRate ?? 0);
      amount = rate * l.quantity;
      if (overridden) byType.OVERRIDDEN += amount;
    }

    // Quantities always multiply out, even when the rate is overridden -
    // the material schedule is still how much is needed.
    if (l.priced) {
      for (const b of l.priced.breakdown) {
        const qty = b.quantityPerUnit * l.quantity;
        const row = schedule.get(b.resourceId) ?? { resourceId: b.resourceId, code: b.code, name: b.name, unit: b.unit, type: b.type, quantity: 0, price: b.price, amount: 0 };
        row.quantity += qty;
        row.amount += b.price == null ? 0 : qty * b.price;
        schedule.set(b.resourceId, row);
        if (!overridden) byType[b.type] += b.price == null ? 0 : qty * b.price;
      }
      if (!overridden) for (const m of l.priced.missing) missing.add(m);
    }

    worksTotal += amount;
    const key = l.costCode?.id ?? '__none__';
    const bucket = byCode.get(key) ?? { costCodeId: l.costCode?.id ?? null, code: l.costCode?.code ?? null, name: l.costCode?.name ?? 'Not coded', amount: 0 };
    bucket.amount += amount;
    byCode.set(key, bucket);
    priced.push({ id: l.id, rate, amount, computedRate, overridden, missing: l.priced?.missing ?? [] });
  }

  const preliminaries = (worksTotal * markups.preliminariesPct) / 100;
  const overheadProfit = ((worksTotal + preliminaries) * markups.overheadProfitPct) / 100;
  const contingency = ((worksTotal + preliminaries + overheadProfit) * markups.contingencyPct) / 100;
  const totalExclVat = worksTotal + preliminaries + overheadProfit + contingency;
  const vat = (totalExclVat * markups.vatPct) / 100;

  return {
    lines: priced,
    worksTotal,
    preliminaries,
    overheadProfit,
    contingency,
    totalExclVat,
    vat,
    totalInclVat: totalExclVat + vat,
    byCostCode: [...byCode.values()].sort((a, b) => (a.code ?? 'zz').localeCompare(b.code ?? 'zz')),
    byType,
    schedule: [...schedule.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
    missingPrices: [...missing].sort(),
  };
}

/** Suggest work items for one model group by matching each item's takeoff
 * keywords against the group's category and type name. */
export function matchesKeywords(keywords: string[], ...haystack: string[]): boolean {
  const text = haystack.join(' ').toLowerCase();
  return keywords.some((k) => k.trim() && text.includes(k.trim().toLowerCase()));
}
