'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send, Stamp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { defaultDueDate, dueLabel, dueTone, todayInput, type ApprovalOutcome } from '@/lib/signoff';
import { SignedCopies } from './SignedCopies';
import { formatDate } from '@/lib/dates';
import { DateInput } from '@/components/ui/DateInput';

interface Request {
  id: string;
  status: 'PENDING' | 'DECIDED' | 'WITHDRAWN';
  outcome: ApprovalOutcome | null;
  comment: string | null;
  message: string | null;
  responseDueAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  requestedBy: { fullName: string };
  decidedBy: { fullName: string } | null;
}

const inputClass = 'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/** Sending a drawing or document revision to the client for approval and
 * signature (App Review, 17 Oct 2026), and what came back. */
export function ClientApprovalBox({ projectId, documentId, revisionId, onChanged }: { projectId: string; documentId: string; revisionId: string; onChanged: () => void }) {
  const { authedFetch, user } = useAuth();
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [dueBy, setDueBy] = useState(defaultDueDate());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Request[]>(`/projects/${projectId}/document-approvals?revisionId=${revisionId}`)
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [authedFetch, projectId, revisionId]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (requests === null) return null;
  const latest = requests[0];
  const pending = latest?.status === 'PENDING' ? latest : null;
  const decided = requests.filter((r) => r.status === 'DECIDED');
  if (!internal && requests.length === 0) return null;
  const due = dueLabel(pending?.responseDueAt);

  return (
    <div className="mb-2 rounded-md border border-slate-200 p-2.5 text-xs dark:border-slate-700">
      <p className="mb-1.5 flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
        <Stamp size={12} /> Client approval
      </p>
      {error && <p className="mb-1.5 rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {pending ? (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
          <span>
            With the client since {formatDate(pending.createdAt)} (sent by {pending.requestedBy.fullName})
          </span>
          {due && <span className={`rounded-full px-2 py-0.5 font-medium ${dueTone(due)}`}>{due.text}</span>}
          {internal && (
            <button type="button" disabled={busy} onClick={() => run(() => authedFetch(`/projects/${projectId}/document-approvals/${pending.id}/withdraw`, { method: 'POST' }))} className="text-slate-500 hover:underline">
              Withdraw
            </button>
          )}
        </div>
      ) : decided.length > 0 ? (
        internal && <p className="text-slate-500">The client has decided on this revision. Upload a new revision to send it again.</p>
      ) : (
        internal && (
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputClass} min-w-[160px] flex-1`} placeholder="Message to the client (optional)" value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message to the client" />
            <label className="flex items-center gap-1 text-slate-500">
              Respond by
              <DateInput min={todayInput()} className={inputClass} value={dueBy} onChange={(e) => setDueBy(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() =>
                  authedFetch(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/client-approval`, {
                    method: 'POST',
                    body: { message: message.trim() || undefined, responseDueAt: dueBy || undefined },
                  }).then(() => setMessage('')),
                )
              }
              className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-700 px-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send size={12} /> Send to the client for approval
            </button>
            <p className="w-full text-slate-400">Sharing it with the client happens automatically. The client signs, and their signature is added to the file.</p>
          </div>
        )
      )}

      <div className="mt-1.5">
        <SignedCopies projectId={projectId} subjectId={revisionId} refresh={decided.length} />
      </div>
    </div>
  );
}
