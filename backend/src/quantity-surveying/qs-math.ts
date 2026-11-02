import { round } from '../cost-database/pricing.js';

/** The sums a QS works with, kept apart from the services so the rules are
 * in one place: a bill's totals, and a valuation's retention and amount due. */

export interface PlanItemLike {
  section: string | null;
  type: string;
  amount: number;
}

export interface PlanRates {
  prelimsPct: number;
  contingencyPct: number;
  escalationPct: number;
  vatPct: number;
  grossFloorArea: number | null;
}

/** Items, then preliminaries, contingency and escalation in QS order, then
 * VAT, with each bill's subtotal and the provisional and prime-cost sums
 * the contract carries but hasn't measured. */
export function planTotals(items: PlanItemLike[], r: PlanRates) {
  const sections = new Map<string, number>();
  let measured = 0;
  let provisional = 0;
  let primeCost = 0;
  let dayworks = 0;
  for (const i of items) {
    const key = i.section?.trim() || 'General';
    sections.set(key, (sections.get(key) ?? 0) + i.amount);
    if (i.type === 'PROVISIONAL_SUM') provisional += i.amount;
    else if (i.type === 'PRIME_COST_SUM') primeCost += i.amount;
    else if (i.type === 'DAYWORK') dayworks += i.amount;
    else measured += i.amount;
  }
  const subtotal = measured + provisional + primeCost + dayworks;
  const prelims = (subtotal * r.prelimsPct) / 100;
  const contingency = ((subtotal + prelims) * r.contingencyPct) / 100;
  const escalation = ((subtotal + prelims + contingency) * r.escalationPct) / 100;
  const totalExclVat = subtotal + prelims + contingency + escalation;
  const vat = (totalExclVat * r.vatPct) / 100;
  return {
    sections: [...sections.entries()].map(([section, total]) => ({ section, total: round(total) })),
    measured: round(measured),
    provisional: round(provisional),
    primeCost: round(primeCost),
    dayworks: round(dayworks),
    subtotal: round(subtotal),
    prelims: round(prelims),
    contingency: round(contingency),
    escalation: round(escalation),
    totalExclVat: round(totalExclVat),
    vat: round(vat),
    total: round(totalExclVat + vat),
    perM2: r.grossFloorArea ? round(totalExclVat / r.grossFloorArea) : null,
  };
}

export interface ValuationInputs {
  lines: { variationId: string | null; valueToDate: number }[];
  materialsOnSite: number;
  retentionReleasePct: number;
  contract: { contractSum: number; retentionPct: number; retentionLimitPct: number | null; vatPct: number };
  /** The cumulative net of the last certified valuation before this one. */
  previouslyCertified: number;
  /** Contract price adjustment to date. */
  escalation?: number;
}

/** Gross value to date, less retention (capped at its limit, and released
 * in part at practical completion), less what was certified before, plus
 * VAT. */
export function valuationFigures(v: ValuationInputs) {
  const workDone = v.lines.filter((l) => !l.variationId).reduce((s, l) => s + l.valueToDate, 0);
  const variationsDone = v.lines.filter((l) => l.variationId).reduce((s, l) => s + l.valueToDate, 0);
  const grossValuation = workDone + variationsDone + (v.escalation ?? 0) + v.materialsOnSite;
  const full = (grossValuation * v.contract.retentionPct) / 100;
  const capped = v.contract.retentionLimitPct != null ? Math.min(full, (v.contract.contractSum * v.contract.retentionLimitPct) / 100) : full;
  const retention = Math.max(capped, 0) * (1 - v.retentionReleasePct / 100);
  const cumulativeNet = grossValuation - retention;
  const netDue = cumulativeNet - v.previouslyCertified;
  const vat = (netDue * v.contract.vatPct) / 100;
  return {
    workDone: round(workDone),
    variationsDone: round(variationsDone),
    grossValuation: round(grossValuation),
    retention: round(retention),
    cumulativeNet: round(cumulativeNet),
    previouslyCertified: round(v.previouslyCertified),
    netDue: round(netDue),
    vat: round(vat),
    amountDue: round(netDue + vat),
  };
}

/** Contract price adjustment for one period (the Haylett formula CPAP uses):
 * (1 - fixed share) x the period's work x (sum of weight x index now / index
 * at base, less 1). The weights add to 1. */
export function priceAdjustment(periodValue: number, fixedPct: number, parts: { weight: number; base: number; current: number }[]) {
  const factor = parts.reduce((s, p) => s + (p.weight * p.current) / p.base, 0);
  return { factor: Math.round(factor * 10000) / 10000, amount: round((1 - fixedPct / 100) * periodValue * (factor - 1)) };
}

/** A QS's S-curve: the cumulative share of the contract spent by the end
 * of month i of n (slow start, fast middle, slow finish). */
export function sCurve(n: number): number[] {
  const f = (t: number) => t * t * (3 - 2 * t);
  return Array.from({ length: n }, (_, i) => f((i + 1) / n) - f(i / n));
}
