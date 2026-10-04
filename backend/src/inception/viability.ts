import type { ViabilityScenario } from '../generated/prisma/client.js';

export interface ViabilityResult {
  constructionCost: number;
  professionalFees: number;
  contingency: number;
  financeCost: number;
  totalDevelopmentCost: number;
  costPerSqm: number | null;
  netOperatingIncome: number | null;
  grossDevelopmentValue: number;
  profit: number;
  profitOnCostPct: number | null;
  profitOnValuePct: number | null;
  yieldOnCostPct: number | null;
  residualLandValue: number;
  viable: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Desktop viability (PROCSA DM 1.3) — a deliberately simple residual
 * appraisal, the level of a Stage 1 "desk top" check rather than a full
 * feasibility study:
 *  - fees and contingency are percentages of construction cost;
 *  - finance is simple interest over the development period, on the land
 *    for the whole period and on half of the building spend (the usual
 *    S-curve average);
 *  - rental schemes are valued as net income ÷ cap rate;
 *  - residual land value is what the land could cost while still
 *    returning the target profit on cost. */
export function computeViability(s: ViabilityScenario): ViabilityResult {
  const constructionCost = s.gbaSqm * s.constructionRatePerSqm;
  const professionalFees = (constructionCost * s.professionalFeesPct) / 100;
  const contingency = (constructionCost * s.contingencyPct) / 100;
  const buildSpend = constructionCost + professionalFees + contingency + s.otherCosts;
  const financeCost = ((s.landCost + buildSpend * 0.5) * s.financeRatePct * s.financeMonths) / 100 / 12;
  const totalDevelopmentCost = s.landCost + buildSpend + financeCost;

  let netOperatingIncome: number | null = null;
  let grossDevelopmentValue: number;
  if (s.revenueMode === 'RENTAL') {
    netOperatingIncome = s.lettableAreaSqm * s.rentPerSqmMonth * 12 * (1 - s.vacancyPct / 100);
    grossDevelopmentValue = s.capRatePct > 0 ? netOperatingIncome / (s.capRatePct / 100) : 0;
  } else {
    grossDevelopmentValue = s.sellableAreaSqm * s.salePricePerSqm;
  }

  const profit = grossDevelopmentValue - totalDevelopmentCost;
  const profitOnCostPct = totalDevelopmentCost > 0 ? (profit / totalDevelopmentCost) * 100 : null;
  const residualLandValue = grossDevelopmentValue / (1 + s.targetProfitPct / 100) - (totalDevelopmentCost - s.landCost);

  return {
    constructionCost: round(constructionCost),
    professionalFees: round(professionalFees),
    contingency: round(contingency),
    financeCost: round(financeCost),
    totalDevelopmentCost: round(totalDevelopmentCost),
    costPerSqm: s.gbaSqm > 0 ? round(totalDevelopmentCost / s.gbaSqm) : null,
    netOperatingIncome: netOperatingIncome === null ? null : round(netOperatingIncome),
    grossDevelopmentValue: round(grossDevelopmentValue),
    profit: round(profit),
    profitOnCostPct: profitOnCostPct === null ? null : round(profitOnCostPct),
    profitOnValuePct: grossDevelopmentValue > 0 ? round((profit / grossDevelopmentValue) * 100) : null,
    yieldOnCostPct: netOperatingIncome !== null && totalDevelopmentCost > 0 ? round((netOperatingIncome / totalDevelopmentCost) * 100) : null,
    residualLandValue: round(residualLandValue),
    viable: profitOnCostPct !== null && profitOnCostPct >= s.targetProfitPct,
  };
}
