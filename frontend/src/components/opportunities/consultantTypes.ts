import type { RfqStatus } from '@/lib/stage0';

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface EligibleConsultant {
  id: string;
  name: string;
  city: string | null;
  registrationStatus: string;
  prequalificationStatus: string;
  hasPortalAccess: boolean;
  rating: RatingSummary;
}

export interface RankingEntry {
  quoteId: string;
  contractorId: string;
  contractorName: string;
  price: number;
  currency: string;
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

export interface ConsultantRfq {
  id: string;
  rfqNumber: string;
  title: string;
  discipline: string | null;
  scopeDescription: string | null;
  dueDate: string | null;
  currency: string | null;
  priceWeight: number;
  ratingWeight: number;
  status: RfqStatus;
  createdBy: { fullName: string };
  invitations: { id: string; contractorId: string; contractor: { id: string; name: string }; rating: RatingSummary }[];
  quotes: { id: string; contractorId: string; submittedBy: { fullName: string }; technicalProposal: string | null; commercialTerms: string | null }[];
  // Who was appointed from this RFQ (opportunity or project), if anyone.
  appointment: { contractorId: string; quoteId: string | null; rankAtAward: number | null; justification: string | null } | null;
  ranking: RankingEntry[];
}

export function ratingText(r: { average: number | null; count: number }) {
  if (r.average === null) return 'No track record yet';
  return `${r.average.toFixed(1)}★ from ${r.count} ${r.count === 1 ? 'rating' : 'ratings'}`;
}
