import { apiFetchBlobUrl } from './api-client';

// The quantity surveyor's records (PROCSA QS Stages 2 to 6). Keep in step
// with backend quantity-surveying/.

export type CostPlanKind = 'PRELIMINARY' | 'ELEMENTAL' | 'DETAILED' | 'PRE_TENDER' | 'TENDER_BOQ' | 'CONTRACT_BOQ';
export type CostPlanStatus = 'DRAFT' | 'ISSUED' | 'ACCEPTED';
export type ItemType = 'MEASURED' | 'PROVISIONAL_SUM' | 'PRIME_COST_SUM' | 'DAYWORK';
export type ValuationStatus = 'DRAFT' | 'SUBMITTED' | 'CERTIFIED' | 'APPROVED' | 'REJECTED' | 'PAID';
export type FinalAccountStatus = 'NOT_STARTED' | 'IN_PREPARATION' | 'SUBMITTED' | 'AGREED';

export const KIND_LABEL: Record<CostPlanKind, string> = {
  PRELIMINARY: 'Preliminary estimate',
  ELEMENTAL: 'Elemental estimate',
  DETAILED: 'Detailed estimate',
  PRE_TENDER: 'Pre-tender estimate',
  TENDER_BOQ: 'Bill of quantities for tender',
  CONTRACT_BOQ: 'Priced contract bill',
};

/** Which PROCSA stage each kind belongs to, shown as a hint. */
export const KIND_STAGE: Record<CostPlanKind, string> = {
  PRELIMINARY: 'Stage 2 · QS 2.5',
  ELEMENTAL: 'Stage 2 · QS 2.5',
  DETAILED: 'Stage 3 · QS 3.5',
  PRE_TENDER: 'Stage 4 · QS 4.3',
  TENDER_BOQ: 'Stage 4 · QS 4.4',
  CONTRACT_BOQ: 'Stage 4 · QS 4.7',
};

export const PLAN_STATUS: Record<CostPlanStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  ISSUED: { label: 'Issued', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ACCEPTED: { label: 'Accepted by Setjeka', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
};

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  MEASURED: 'Measured',
  PROVISIONAL_SUM: 'Provisional sum',
  PRIME_COST_SUM: 'Prime cost sum',
  DAYWORK: 'Daywork',
};

export const VALUATION_STATUS: Record<ValuationStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  SUBMITTED: { label: 'With Setjeka and the architect', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  CERTIFIED: { label: 'Certified, with the client', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  APPROVED: { label: 'Approved for payment', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  REJECTED: { label: 'Rejected by the client', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  PAID: { label: 'Paid', tone: 'bg-emerald-600 text-white dark:bg-emerald-700' },
};

export const FINAL_ACCOUNT_STATUS: Record<FinalAccountStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PREPARATION: 'In preparation',
  SUBMITTED: 'Submitted',
  AGREED: 'Agreed',
};

/** Who reviews a contract's valuations (PROCSA Architect 5.7, Civil 5.8). */
export const REVIEWER_OPTIONS = [
  { value: 'ARCHITECT', label: 'The architect' },
  { value: 'CIVIL_ENGINEER', label: 'The civil engineer' },
  { value: 'STRUCTURAL_ENGINEER', label: 'The structural engineer' },
  { value: 'ELECTRICAL_ENGINEER', label: 'The electrical engineer' },
  { value: 'MECHANICAL_ENGINEER', label: 'The mechanical engineer' },
];
export const reviewerTitle = (role: string | null | undefined) => (REVIEWER_OPTIONS.find((o) => o.value === role)?.label ?? 'The architect').replace(/^The /, '');

export const CONTRACT_FORMS = [
  { value: '', label: 'As the project' },
  { value: 'JBCC', label: 'JBCC' },
  { value: 'GCC', label: 'GCC' },
  { value: 'NEC', label: 'NEC' },
  { value: 'FIDIC', label: 'FIDIC' },
  { value: 'OTHER', label: 'Other' },
];

export interface PlanTotals {
  sections: { section: string; total: number }[];
  measured: number;
  provisional: number;
  primeCost: number;
  dayworks: number;
  subtotal: number;
  prelims: number;
  contingency: number;
  escalation: number;
  totalExclVat: number;
  vat: number;
  total: number;
  perM2: number | null;
}

export interface PlanItem {
  id?: string;
  section: string | null;
  ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number;
  type: ItemType;
  costCodeId: string | null;
  notes?: string | null;
}

export interface CostPlanSummary {
  id: string;
  number: string;
  title: string;
  kind: CostPlanKind;
  kindLabel: string;
  status: CostPlanStatus;
  revision: number;
  currency: string;
  itemCount: number;
  totals: PlanTotals;
  preparedBy: { fullName: string };
  acceptedBy: { fullName: string } | null;
  updatedAt: string;
}

export interface CostPlan extends CostPlanSummary {
  grossFloorArea: number | null;
  prelimsPct: number;
  contingencyPct: number;
  escalationPct: number;
  vatPct: number;
  notes: string | null;
  sourceFileName: string | null;
  issuedAt: string | null;
  acceptedAt: string | null;
  items: (PlanItem & { id: string })[];
  revisions: { id: string; revision: number; total: number; itemCount: number; reason: string | null; issuedAt: string; issuedBy: { fullName: string } }[];
  rfqs: { id: string; rfqNumber: string; title: string; status: string }[];
  contracts: { id: string; title: string }[];
  canEdit: boolean;
  canAccept: boolean;
}

export interface Standing {
  valuations: number;
  openValuation: number | null;
  certifiedGross: number;
  certifiedNet: number;
  retentionHeld: number;
  paid: number;
  approvedVariations: number;
  pendingVariations: number;
  agreedClaims: number;
  openClaims: number;
  finalCertified: boolean;
}

export interface Contract {
  id: string;
  title: string;
  contractForm: string | null;
  contractSum: number;
  currency: string;
  retentionPct: number;
  retentionLimitPct: number | null;
  vatPct: number;
  startDate: string | null;
  completionDate: string | null;
  finalAccountStatus: FinalAccountStatus;
  reviewerRole: string;
  measured: boolean;
  certifyWithinDays: number | null;
  payWithinDays: number | null;
  terms: { pmTitle: string; certificate: string; variations: string; certifyWithinDays: number; payWithinDays: number };
  contractor: { id: string; name: string };
  costPlan: { id: string; number: string; title: string } | null;
  rfq: { id: string; rfqNumber: string } | null;
  standing: Standing;
}

export interface ValuationLine {
  id: string;
  description: string;
  contractAmount: number;
  percentComplete: number;
  valueToDate: number;
  costPlanItemId: string | null;
  variationId: string | null;
  /** Measured lines: the bill rate and the quantity to date. */
  rate: number | null;
  quantityToDate: number | null;
  dayworkSheetId: string | null;
}

export interface Valuation {
  id: string;
  number: number;
  isFinal: boolean;
  valuationDate: string;
  status: ValuationStatus;
  materialsOnSite: number;
  retentionReleasePct: number;
  workDone: number;
  variationsDone: number;
  grossValuation: number;
  retention: number;
  cumulativeNet: number;
  previouslyCertified: number;
  netDue: number;
  vat: number;
  amountDue: number;
  notes: string | null;
  returnedReason: string | null;
  certificateNumber: string | null;
  submittedAt: string | null;
  certifiedAt: string | null;
  certifyDueAt: string | null;
  payDueAt: string | null;
  responseDueAt: string | null;
  decisionOutcome: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  contractId: string;
  contract: { id: string; title: string; currency: string; contractSum: number; retentionPct: number; vatPct: number; reviewerRole?: string; contractForm?: string | null; contractor: { name: string } };
  preparedBy: { fullName: string };
  certifiedBy?: { fullName: string } | null;
  decidedBy?: { fullName: string } | null;
  lines?: ValuationLine[];
  reviews?: { id: string; outcome: string; comment: string | null; signerName: string; signerRole: string | null; signedAt: string }[];
  can?: { edit: boolean; submit: boolean; returnToQs: boolean; certify: boolean; decide: boolean; pay: boolean; reopen: boolean; remove: boolean };
}

export const money = (n: number | null | undefined, currency?: string) =>
  n == null ? '—' : `${currency ? `${currency} ` : ''}${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Download a file behind auth (a bill as Excel, a valuation as PDF). */
export async function download(path: string, accessToken: string | null, filename: string) {
  const url = await apiFetchBlobUrl(path, accessToken);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
