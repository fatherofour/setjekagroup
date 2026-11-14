'use client';

import { useEffect, useState } from 'react';
import { Archive, Award, CheckCircle2, FileSignature, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { OUTCOME_LABEL, defaultDueDate, dueLabel, dueTone, openSignedCopy, todayInput, type ApprovalOutcome } from '@/lib/signoff';
import { DecisionDialog } from '@/components/signoff/DecisionDialog';
import { formatDate } from '@/lib/dates';

interface Completion {
  id: string;
  status: 'PENDING' | 'SIGNED' | 'REJECTED' | 'WITHDRAWN';
  completionDate: string;
  message: string | null;
  responseDueAt: string | null;
  issuedByName: string;
  createdAt: string;
  decisionOutcome: ApprovalOutcome | null;
  decisionComment: string | null;
  decidedAt: string | null;
  approvalRecordId: string | null;
}

export interface CloseoutState {
  stage: string;
  status: string;
  closureType: 'COMPLETED' | 'ABANDONED' | null;
  closureReason: string | null;
  closedAt: string | null;
  closedByName: string | null;
  completions: Completion[];
}

const inputClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const fmt = (iso: string) => formatDate(iso);

/** How a project ends (7 Nov 2026). Setjeka sends the client the
 * certificate of completion to sign, then marks the project completed; or
 * abandons it with a reason, which archives it. The client signs the
 * certificate here too. */
export function CloseoutPanel({ projectId, isClient, onChanged }: { projectId: string; isClient: boolean; onChanged: () => void }) {
  const { authedFetch, accessToken, user } = useAuth();
  const setjeka = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const [state, setState] = useState<CloseoutState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'certificate' | 'complete' | 'abandon' | null>(null);
  const [completionDate, setCompletionDate] = useState(todayInput());
  const [message, setMessage] = useState('');
  const [dueBy, setDueBy] = useState(defaultDueDate(7));
  const [reason, setReason] = useState('');
  const [signing, setSigning] = useState<Completion | null>(null);

  const load = () =>
    authedFetch<CloseoutState>(`/projects/${projectId}/closeout`)
      .then(setState)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load close-out.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/closeout/${path}`, { method: 'POST', body });
      setMode(null);
      setReason('');
      setMessage('');
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!state) return error ? <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null;

  const pending = state.completions.find((c) => c.status === 'PENDING') ?? null;
  const signed = state.completions.find((c) => c.status === 'SIGNED') ?? null;
  const latestAnswered = state.completions.find((c) => c.status === 'SIGNED' || c.status === 'REJECTED') ?? null;
  // Consultants and contractors see it once the project has closed; the
  // client once there is a certificate to sign or answered.
  if (!setjeka && !isClient && !state.closureType) return null;
  if (isClient && !pending && !state.closureType && !latestAnswered) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Award size={15} className="text-emerald-700" />
        Close-out
      </h2>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {state.closureType ? (
        <div className={`rounded-md p-3 text-sm ${state.closureType === 'COMPLETED' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'}`}>
          <p className="flex items-center gap-2 font-medium">
            {state.closureType === 'COMPLETED' ? <CheckCircle2 size={16} /> : <Archive size={16} />}
            {state.closureType === 'COMPLETED' ? 'Completed' : 'Abandoned and archived'}
            {state.closedAt && ` on ${fmt(state.closedAt)}`}
            {state.closedByName && ` by ${state.closedByName}`}
          </p>
          {state.closureReason && <p className="mt-1 text-xs">{state.closureType === 'COMPLETED' ? 'Note' : 'Reason'}: {state.closureReason}</p>}
          <p className="mt-1 text-xs opacity-80">The project&apos;s documents stay available under Documents; the signed certificates are in Sign-offs and certificates.</p>
        </div>
      ) : (
        <>
          {pending && (
            <div className="mb-3 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              <p className="text-amber-800 dark:text-amber-300">
                Certificate of completion (works completed {fmt(pending.completionDate)}) sent by {pending.issuedByName} on {fmt(pending.createdAt)}.
                {setjeka && ' Waiting for the client to sign.'}
              </p>
              {pending.message && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{pending.message}</p>}
              {(() => {
                const due = dueLabel(pending.responseDueAt);
                return due && <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${dueTone(due)}`}>{due.text}</span>;
              })()}
              <div className="mt-2 flex flex-wrap gap-2">
                {!setjeka ? (
                  <button type="button" onClick={() => setSigning(pending)} className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
                    <FileSignature size={13} /> Review and sign
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => act(`completion-certificate/${pending.id}/withdraw`, {})} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-amber-100 dark:text-slate-300 dark:hover:bg-amber-950">
                    Withdraw it
                  </button>
                )}
              </div>
            </div>
          )}

          {latestAnswered && !pending && (
            <div className={`mb-3 rounded-md p-3 text-sm ${latestAnswered.status === 'SIGNED' ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-red-50 dark:bg-red-950/40'}`}>
              <p className={latestAnswered.status === 'SIGNED' ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                The client {latestAnswered.decisionOutcome ? OUTCOME_LABEL[latestAnswered.decisionOutcome].toLowerCase() : 'answered'} the certificate of completion
                {latestAnswered.decidedAt && ` on ${fmt(latestAnswered.decidedAt)}`}.
              </p>
              {latestAnswered.decisionComment && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{latestAnswered.decisionComment}</p>}
              {latestAnswered.approvalRecordId && (
                <button type="button" onClick={() => openSignedCopy(projectId, latestAnswered.approvalRecordId!, accessToken)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  <FileSignature size={13} /> Open the signed certificate
                </button>
              )}
            </div>
          )}

          {setjeka && (
            <>
              {mode === null && (
                <div className="flex flex-wrap gap-2">
                  {!pending && (
                    <button
                      type="button"
                      onClick={() => setMode('certificate')}
                      disabled={state.stage !== 'CLOSEOUT'}
                      title={state.stage !== 'CLOSEOUT' ? 'Sent at Stage 6, Close-out' : undefined}
                      className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Send size={13} /> Send the certificate of completion
                    </button>
                  )}
                  <button type="button" onClick={() => setMode('complete')} className="flex items-center gap-1 rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">
                    <CheckCircle2 size={13} /> Mark as completed
                  </button>
                  <button type="button" onClick={() => setMode('abandon')} className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Archive size={13} /> Abandon the project…
                  </button>
                </div>
              )}
              {state.stage !== 'CLOSEOUT' && mode === null && !pending && <p className="mt-2 text-xs text-slate-500">The certificate of completion is sent once the project reaches Stage 6, Close-out.</p>}

              {mode === 'certificate' && (
                <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs text-slate-600 dark:text-slate-300">The client is asked to sign the certificate, in the platform and by email. Once signed, it is filed under Documents &gt; Sign-offs and certificates &gt; Completion.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      Works completed on
                      <input type="date" className={inputClass} value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
                    </label>
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      Respond by
                      <input type="date" min={todayInput()} className={inputClass} value={dueBy} onChange={(e) => setDueBy(e.target.value)} />
                    </label>
                  </div>
                  <label className="block text-xs text-slate-600 dark:text-slate-300">
                    Note to the client (optional)
                    <textarea className={`${inputClass} h-16 py-1.5`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Practical completion reached; the snag list is closed." />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || !completionDate} onClick={() => act('completion-certificate', { completionDate, message: message.trim() || undefined, responseDueAt: dueBy || undefined })} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                      {busy ? 'Sending…' : 'Send to the client'}
                    </button>
                    <button type="button" onClick={() => setMode(null)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mode === 'complete' && (
                <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  {signed ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">The client signed the certificate of completion on {fmt(signed.decidedAt!)}. Marking the project completed closes it; its details can no longer be changed.</p>
                  ) : (
                    <label className="block text-xs text-slate-600 dark:text-slate-300">
                      The client hasn&apos;t signed the certificate of completion. Why complete the project without it? <span className="text-red-600">(required)</span>
                      <textarea className={`${inputClass} h-16 py-1.5`} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || (!signed && reason.trim().length < 5)} onClick={() => act('complete', { reason: reason.trim() || undefined })} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                      {busy ? 'Saving…' : 'Mark as completed'}
                    </button>
                    <button type="button" onClick={() => setMode(null)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mode === 'abandon' && (
                <div className="space-y-2 rounded-md border border-red-200 p-3 dark:border-red-900">
                  <label className="block text-xs text-slate-600 dark:text-slate-300">
                    Why is the project being abandoned? <span className="text-red-600">(required)</span>
                    <textarea className={`${inputClass} h-20 py-1.5`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The client withdrew funding after Stage 1." />
                  </label>
                  <p className="text-xs text-slate-500">The project is archived with all its documents, and the client and team are told. This can&apos;t be undone from here.</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => act('abandon', { reason: reason.trim() })} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                      {busy ? 'Saving…' : 'Abandon and archive'}
                    </button>
                    <button type="button" onClick={() => setMode(null)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {signing && (
        <DecisionDialog
          projectId={projectId}
          title="Certificate of completion"
          context={`Works completed ${fmt(signing.completionDate)}`}
          dueAt={signing.responseDueAt}
          endpoint={`/projects/${projectId}/closeout/completion-certificate/${signing.id}/decide`}
          subjectId={signing.id}
          onClose={() => setSigning(null)}
          onDecided={() => {
            load();
            onChanged();
          }}
        >
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Setjeka Group certifies that the works on this project were completed on {fmt(signing.completionDate)}. By approving, you accept the project as complete.
          </p>
          {signing.message && <p className="text-xs text-slate-500">{signing.message}</p>}
        </DecisionDialog>
      )}
    </div>
  );
}
