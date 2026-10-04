import { projectMemberRoleLabel, type ProjectMemberRole } from './projectMemberRoles';

export interface MemberRef {
  id: string;
  role: ProjectMemberRole;
  externalName: string | null;
  user: { fullName: string } | null;
  contractor: { name: string } | null;
}

export function memberLabel(m: MemberRef | null | undefined): string {
  if (!m) return '—';
  const name = m.user?.fullName ?? m.externalName ?? m.contractor?.name ?? 'Unnamed';
  return `${name} · ${projectMemberRoleLabel(m.role)}`;
}

export type DeliverableStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUESTED';

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting client',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision requested',
};

export const DELIVERABLE_STATUS_TONE: Record<DeliverableStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  SUBMITTED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  REVISION_REQUESTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

export const STAGE_OPTIONS = [
  { value: 'INCEPTION', label: 'Inception' },
  { value: 'CONCEPT', label: 'Concept & Viability' },
  { value: 'DESIGN', label: 'Design Development' },
  { value: 'DOCUMENTATION_PROCUREMENT', label: 'Documentation & Procurement' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'CLOSEOUT', label: 'Close-out' },
];

export const ADVICE_TOPICS = {
  PROCUREMENT_POLICY: 'Procurement policy',
  RIGHTS_CONSTRAINTS_CONSENTS: 'Rights, constraints, consents & approvals',
  CONSULTANTS_REQUIRED: 'Other consultants & services required',
  ECONOMIC_FACTORS: 'Economic factors affecting the project',
  FINANCIAL_DESIGN_CRITERIA: 'Financial design criteria',
  SURVEYS_INVESTIGATIONS: 'Surveys, analyses, tests & investigations',
  GENERAL: 'General',
} as const;

export type AdviceTopic = keyof typeof ADVICE_TOPICS;
