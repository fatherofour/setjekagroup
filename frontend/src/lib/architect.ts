// Labels for the architect-role modules (26 Oct 2026): drawings, authority
// approvals, instructions and letters, inspections. Keep in step with the
// backend enums.

export type IssuePurpose =
  | 'FOR_INFORMATION'
  | 'FOR_COMMENT'
  | 'FOR_COORDINATION'
  | 'FOR_CLIENT_APPROVAL'
  | 'FOR_AUTHORITY_SUBMISSION'
  | 'FOR_PROCUREMENT'
  | 'FOR_CONSTRUCTION'
  | 'AS_BUILT';

export const PURPOSE_LABEL: Record<IssuePurpose, string> = {
  FOR_INFORMATION: 'For information',
  FOR_COMMENT: 'For comment',
  FOR_COORDINATION: 'For co-ordination',
  FOR_CLIENT_APPROVAL: 'For client approval',
  FOR_AUTHORITY_SUBMISSION: 'For authority submission',
  FOR_PROCUREMENT: 'For procurement',
  FOR_CONSTRUCTION: 'For construction',
  AS_BUILT: 'As built',
};
export const PURPOSE_OPTIONS = (Object.keys(PURPOSE_LABEL) as IssuePurpose[]).map((value) => ({ value, label: PURPOSE_LABEL[value] }));

export type CommunicationKind = 'CLIENT_REQUEST' | 'SETJEKA_INSTRUCTION' | 'CONTRACT_INSTRUCTION' | 'CORRESPONDENCE';
export type CommunicationStatus = 'DRAFT' | 'AWAITING_ISSUE' | 'ISSUED' | 'RESPONDED' | 'CLOSED' | 'CANCELLED';

export const KIND_LABEL: Record<CommunicationKind, string> = {
  CLIENT_REQUEST: 'Client request',
  SETJEKA_INSTRUCTION: 'Setjeka instruction',
  CONTRACT_INSTRUCTION: 'Contract instruction',
  CORRESPONDENCE: 'Letter',
};
export const KIND_HELP: Record<CommunicationKind, string> = {
  CLIENT_REQUEST: 'A request to Setjeka. Setjeka passes it on to the architect or contractor where needed.',
  SETJEKA_INSTRUCTION: 'Setjeka instructs a consultant or the contractor.',
  CONTRACT_INSTRUCTION: 'An instruction to the contractor. A consultant drafts it; Setjeka issues it.',
  CORRESPONDENCE: 'A letter on the record.',
};
export const COMM_STATUS: Record<CommunicationStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  AWAITING_ISSUE: { label: 'Waiting for Setjeka to issue', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ISSUED: { label: 'Issued', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  RESPONDED: { label: 'Responded', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CLOSED: { label: 'Closed', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-500' },
};

export type InspectionKind = 'QUALITY' | 'DESIGN_SUPERVISION' | 'TEST_WITNESS' | 'MOCK_UP' | 'PRACTICAL_COMPLETION' | 'DEFECTS_VERIFICATION';
export type InspectionStatus = 'REQUESTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type InspectionOutcome = 'CONFORMS' | 'CONFORMS_WITH_COMMENTS' | 'NON_CONFORMING';

export const INSPECTION_KIND: Record<InspectionKind, string> = {
  QUALITY: 'Quality inspection',
  DESIGN_SUPERVISION: "Architect's site inspection",
  TEST_WITNESS: 'Test witnessed',
  MOCK_UP: 'Mock-up review',
  PRACTICAL_COMPLETION: 'Practical completion inspection',
  DEFECTS_VERIFICATION: 'Defects verification',
};
export const INSPECTION_STATUS: Record<InspectionStatus, { label: string; tone: string }> = {
  REQUESTED: { label: 'Requested', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SCHEDULED: { label: 'Scheduled', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  COMPLETED: { label: 'Completed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};
export const OUTCOME: Record<InspectionOutcome, { label: string; tone: string }> = {
  CONFORMS: { label: 'Conforms', tone: 'text-emerald-700 dark:text-emerald-400' },
  CONFORMS_WITH_COMMENTS: { label: 'Conforms, with comments', tone: 'text-amber-700 dark:text-amber-400' },
  NON_CONFORMING: { label: 'Does not conform', tone: 'text-red-700 dark:text-red-400' },
};

export type ConsentStatus = 'NOT_STARTED' | 'IN_PREPARATION' | 'SUBMITTED' | 'RETURNED_WITH_COMMENTS' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';
export type ConsentEventKind = 'SUBMITTED' | 'COMMENTS_RECEIVED' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED' | 'NOTE';

export const CONSENT_STATUS: Record<ConsentStatus, { label: string; tone: string }> = {
  NOT_STARTED: { label: 'Not started', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  IN_PREPARATION: { label: 'In preparation', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  SUBMITTED: { label: 'With the authority', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  RETURNED_WITH_COMMENTS: { label: 'Returned with comments', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  APPROVED: { label: 'Approved', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Refused', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  NOT_REQUIRED: { label: 'Not required', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};
export const CONSENT_EVENT: Record<ConsentEventKind, string> = {
  SUBMITTED: 'Submitted',
  COMMENTS_RECEIVED: 'Comments received',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Refused',
  NOTE: 'Note',
};

export const fmtDay = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDayTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A project member as /projects/:id/members returns it. */
export interface Member {
  id: string;
  role: string;
  userId: string | null;
  externalName: string | null;
  externalCompany: string | null;
  user: { id: string; fullName: string; email: string } | null;
  contractor: { id: string; name: string } | null;
}
export const memberName = (m: Member) => m.user?.fullName ?? m.externalName ?? '—';
export const ROLE_LABEL: Record<string, string> = {
  DEVELOPMENT_MANAGER: 'Development Manager',
  PROJECT_MANAGER: 'Project Manager',
  PLANNER_SCHEDULER: 'Planner',
  QUANTITY_SURVEYOR: 'Quantity Surveyor',
  PROCUREMENT_MANAGER: 'Procurement Manager',
  ARCHITECT_ENGINEER: 'Architect / Engineer',
  ARCHITECT: 'Architect',
  STRUCTURAL_ENGINEER: 'Structural Engineer',
  CIVIL_ENGINEER: 'Civil Engineer',
  ELECTRICAL_ENGINEER: 'Electrical Engineer',
  MECHANICAL_ENGINEER: 'Mechanical Engineer',
  SITE_MANAGER: 'Site Manager',
  QA_QC_MANAGER: 'QA/QC Manager',
  HSE_MANAGER: 'HSE Manager',
  CONTRACTOR: 'Contractor',
  CLIENT: 'Client',
  OTHER: 'Other',
};

export const inputCls =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
// The Select draws only what it's given; this matches inputCls without the
// width, so filters can size themselves.
export const selectCls =
  'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const textareaCls =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const primaryBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50';
export const secondaryBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
export const cardCls = 'rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
export const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-300';
