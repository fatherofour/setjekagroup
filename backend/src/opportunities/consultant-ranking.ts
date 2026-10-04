import type { PrismaService } from '../prisma/prisma.service.js';
import type { Currency, OrganisationProjectRole } from '../generated/prisma/enums.js';

/** A consultant with no rating history is scored as if rated 3/5 - the
 * midpoint of the scale - so an unknown firm is neither rewarded nor
 * punished, and price alone separates it from rated peers. */
export const NEUTRAL_RATING = 3;

export interface RatingSummary {
  average: number | null;
  count: number;
}

/** Track record across every past appointment: each quick 1-5 star rating
 * counts once, and each 5-dimension vendor scorecard counts once as the
 * average of its dimensions (both are on the same 1-5 scale). */
export async function ratingSummaries(prisma: PrismaService, contractorIds: string[]): Promise<Map<string, RatingSummary>> {
  const ids = [...new Set(contractorIds)];
  const result = new Map<string, RatingSummary>(ids.map((id) => [id, { average: null, count: 0 }]));
  if (ids.length === 0) return result;

  const [ratings, scorecards] = await Promise.all([
    prisma.organisationRating.findMany({ where: { contractorId: { in: ids } }, select: { contractorId: true, stars: true } }),
    prisma.vendorScorecard.findMany({
      where: { appointment: { contractorId: { in: ids } } },
      select: {
        costScore: true,
        qualityScore: true,
        deliveryScore: true,
        safetyScore: true,
        documentationScore: true,
        appointment: { select: { contractorId: true } },
      },
    }),
  ]);

  const values = new Map<string, number[]>(ids.map((id) => [id, []]));
  for (const r of ratings) values.get(r.contractorId)?.push(r.stars);
  for (const s of scorecards) {
    const avg = (s.costScore + s.qualityScore + s.deliveryScore + s.safetyScore + s.documentationScore) / 5;
    values.get(s.appointment.contractorId)?.push(avg);
  }
  for (const [id, list] of values) {
    if (list.length > 0) result.set(id, { average: list.reduce((a, b) => a + b, 0) / list.length, count: list.length });
  }
  return result;
}

export interface RankableQuote {
  id: string;
  contractorId: string;
  contractor: { id: string; name: string };
  price: number;
  currency: Currency;
  leadTimeDays: number | null;
}

export interface RankingEntry {
  quoteId: string;
  contractorId: string;
  contractorName: string;
  price: number;
  currency: Currency;
  leadTimeDays: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  priceScore: number | null;
  ratingScore: number | null;
  combinedScore: number | null;
  rank: number | null;
  recommended: boolean;
  excludedReason: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Price score: the cheapest comparable quote scores 100, others score
 * cheapest/price*100 (so a quote twice the cheapest scores 50). Rating
 * score: average rating as a percentage of 5. Combined: the RFQ's own
 * price/rating weights. Quotes in a currency other than the RFQ's are
 * listed but not ranked - comparing ZAR to USD needs an exchange rate the
 * app deliberately doesn't hold. Ties go to the cheaper quote. */
export function rankQuotes(
  rfq: { currency: Currency | null; priceWeight: number; ratingWeight: number },
  quotes: RankableQuote[],
  ratings: Map<string, RatingSummary>,
): RankingEntry[] {
  const evalCurrency = rfq.currency ?? quotes[0]?.currency ?? null;
  const comparable = quotes.filter((q) => q.currency === evalCurrency);
  const minPrice = comparable.length > 0 ? Math.min(...comparable.map((q) => q.price)) : 0;
  const totalWeight = rfq.priceWeight + rfq.ratingWeight || 1;

  const entries: RankingEntry[] = quotes.map((q) => {
    const rating = ratings.get(q.contractorId) ?? { average: null, count: 0 };
    const base = {
      quoteId: q.id,
      contractorId: q.contractorId,
      contractorName: q.contractor.name,
      price: q.price,
      currency: q.currency,
      leadTimeDays: q.leadTimeDays,
      ratingAverage: rating.average === null ? null : round1(rating.average),
      ratingCount: rating.count,
      rank: null,
      recommended: false,
    };
    if (q.currency !== evalCurrency) {
      return {
        ...base,
        priceScore: null,
        ratingScore: null,
        combinedScore: null,
        excludedReason: `Quoted in ${q.currency}; this RFQ is evaluated in ${evalCurrency}`,
      };
    }
    const priceScore = q.price <= 0 ? 100 : minPrice <= 0 ? 0 : (minPrice / q.price) * 100;
    const ratingScore = ((rating.average ?? NEUTRAL_RATING) / 5) * 100;
    const combinedScore = (rfq.priceWeight * priceScore + rfq.ratingWeight * ratingScore) / totalWeight;
    return {
      ...base,
      priceScore: round1(priceScore),
      ratingScore: round1(ratingScore),
      combinedScore: round1(combinedScore),
      excludedReason: null,
    };
  });

  const ranked = entries
    .filter((e) => e.combinedScore !== null)
    .sort((a, b) => b.combinedScore! - a.combinedScore! || a.price - b.price);
  ranked.forEach((e, i) => {
    e.rank = i + 1;
    e.recommended = i === 0;
  });
  return [...ranked, ...entries.filter((e) => e.combinedScore === null)];
}

const ROLE_BY_DISCIPLINE: Record<string, OrganisationProjectRole> = {
  architect: 'ARCHITECT',
  'quantity surveyor': 'QUANTITY_SURVEYOR',
  'civil engineer': 'CIVIL_ENGINEER',
  'structural engineer': 'STRUCTURAL_ENGINEER',
  'electrical engineer': 'ELECTRICAL_ENGINEER',
  'mechanical engineer': 'MECHANICAL_ENGINEER',
  'project manager': 'PROJECT_MANAGER',
  'development manager': 'DEVELOPMENT_MANAGER',
};

export function roleForDiscipline(discipline: string | null | undefined): OrganisationProjectRole {
  return ROLE_BY_DISCIPLINE[(discipline ?? '').trim().toLowerCase()] ?? 'CONSULTANT';
}
