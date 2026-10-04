export type OpportunityStage = 'IDENTIFIED' | 'UNDER_EVALUATION' | 'APPROVED' | 'ON_HOLD' | 'REJECTED' | 'CONVERTED';

export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  IDENTIFIED: 'Identified',
  UNDER_EVALUATION: 'Under Evaluation',
  APPROVED: 'Approved',
  ON_HOLD: 'On Hold',
  REJECTED: 'Rejected',
  CONVERTED: 'Converted to project',
};

export const OPPORTUNITY_STAGE_TONE: Record<OpportunityStage, string> = {
  IDENTIFIED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  UNDER_EVALUATION: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  ON_HOLD: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  CONVERTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

export type SiteStatus = 'CANDIDATE' | 'SHORTLISTED' | 'SELECTED' | 'REJECTED';

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  CANDIDATE: 'Candidate',
  SHORTLISTED: 'Shortlisted',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

export const SITE_STATUS_TONE: Record<SiteStatus, string> = {
  CANDIDATE: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  SHORTLISTED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  SELECTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export type RfqStatus = 'DRAFT' | 'ISSUED' | 'CLOSED' | 'AWARDED' | 'CANCELLED';

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued — accepting quotes',
  CLOSED: 'Closed — evaluating',
  AWARDED: 'Awarded',
  CANCELLED: 'Cancelled',
};

export const RFQ_STATUS_TONE: Record<RfqStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ISSUED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  CLOSED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  AWARDED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export interface ClientSummary {
  id: string;
  name: string;
  registrationNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface Stage0Item {
  code: string;
  text: string;
  tab: string;
  required: boolean;
  done: boolean;
  source: 'auto' | 'manual' | null;
  evidence: string | null;
  manualCheck: { doneBy: string; doneAt: string; note: string | null } | null;
}

export interface Readiness {
  roles: { key: string; label: string; source: string; items: Stage0Item[] }[];
  blockers: string[];
  canConvert: boolean;
  done: number;
  total: number;
}

export function isExecutive(user: { role: string; accountType: string } | null | undefined) {
  return Boolean(user && user.accountType === 'INTERNAL' && (user.role === 'MANAGER' || user.role === 'ADMIN'));
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (value == null) return '—';
  return `${currency ?? ''} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`.trim();
}

export const inputClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

export const cardClass = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';

export const primaryButton =
  'inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
