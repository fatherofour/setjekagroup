import { apiFetchBlobUrl } from './api-client';

export type ApprovalOutcome = 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REJECTED' | 'REJECTED_WITH_COMMENTS';
export type SignatureMethod = 'ACCEPTED' | 'DRAWN' | 'TYPED' | 'UPLOADED';

export interface SignatureInput {
  method: SignatureMethod;
  image?: string;
  useSaved?: boolean;
  saveForNextTime?: boolean;
}

// App Review, 17 Oct 2026: the four responses.
export const OUTCOMES: { value: ApprovalOutcome; label: string; hint: string; approve: boolean }[] = [
  { value: 'APPROVED', label: 'Approved', hint: 'Go ahead as it stands.', approve: true },
  { value: 'APPROVED_WITH_COMMENTS', label: 'Approved with comments', hint: 'Go ahead, taking your comments into account.', approve: true },
  { value: 'REJECTED', label: 'Rejected', hint: 'Not accepted.', approve: false },
  { value: 'REJECTED_WITH_COMMENTS', label: 'Rejected with comments', hint: 'Not accepted; your comments say what has to change.', approve: false },
];

export const OUTCOME_LABEL: Record<ApprovalOutcome, string> = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label])) as Record<ApprovalOutcome, string>;

export const OUTCOME_TONE: Record<ApprovalOutcome, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  APPROVED_WITH_COMMENTS: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  REJECTED_WITH_COMMENTS: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export interface ApprovalRecord {
  id: string;
  subject: string;
  subjectId: string;
  title: string;
  outcome: ApprovalOutcome;
  comment: string | null;
  method: SignatureMethod;
  signerName: string;
  signerRole: string | null;
  signedAt: string;
}

/** A respond-by date a few days ahead, as yyyy-mm-dd (the client's
 * example was "within three days"). */
export function defaultDueDate(days = 3) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayInput() {
  return defaultDueDate(0);
}

/** "Respond by 3 Nov" or "Overdue since 1 Nov". */
export function dueLabel(iso: string | null | undefined): { text: string; overdue: boolean; soon: boolean } | null {
  if (!iso) return null;
  const due = new Date(iso);
  const now = Date.now();
  const day = due.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  if (due.getTime() < now) return { text: `Overdue since ${day}`, overdue: true, soon: false };
  return { text: `Respond by ${day}`, overdue: false, soon: due.getTime() - now < 3 * 86_400_000 };
}

export function dueTone(d: { overdue: boolean; soon: boolean }) {
  return d.overdue
    ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
    : d.soon
      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

/** Opens the signed PDF in a new tab (it sits behind sign-in, so it's
 * fetched with the access token first). */
export async function openSignedCopy(projectId: string, recordId: string, accessToken: string | null) {
  const win = window.open('', '_blank');
  const url = await apiFetchBlobUrl(`/projects/${projectId}/approval-records/${recordId}/signed`, accessToken);
  if (win) win.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
