'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, FileSignature, Loader2, X, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { OUTCOMES, dueLabel, dueTone, openSignedCopy, type ApprovalOutcome, type ApprovalRecord, type SignatureInput } from '@/lib/signoff';
import { SignaturePad } from './SignaturePad';

/** Decide and sign one item: a Stage 1 document, a variation, a stage move
 * or a drawing (App Review, 17 Oct 2026). Four responses; comments are
 * required for the "with comments" ones; the signature is drawn, typed,
 * uploaded or saved, or the approver accepts without signing. The system
 * adds the signature to the document and offers the signed copy at the end. */
export function DecisionDialog({
  projectId,
  title,
  context,
  dueAt,
  endpoint,
  method = 'POST',
  subjectId,
  children,
  onClose,
  onDecided,
}: {
  projectId: string;
  title: string;
  context?: string;
  dueAt?: string | null;
  /** The decide endpoint, e.g. /projects/:id/commercial/variations/:vid/decide */
  endpoint: string;
  method?: 'POST' | 'PATCH';
  /** The approval record's subject id, to find the signed copy afterwards. */
  subjectId: string;
  /** What's being decided: a summary, or a link to view the document. */
  children?: ReactNode;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { authedFetch, accessToken, user } = useAuth();
  const [outcome, setOutcome] = useState<ApprovalOutcome | null>(null);
  const [comment, setComment] = useState('');
  const [signature, setSignature] = useState<SignatureInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<ApprovalRecord | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const needsComment = outcome?.endsWith('WITH_COMMENTS') ?? false;
  const approving = outcome ? OUTCOMES.find((o) => o.value === outcome)!.approve : false;
  const ready = Boolean(outcome) && (!needsComment || comment.trim().length > 0) && Boolean(signature);
  const due = dueLabel(dueAt);

  async function submit() {
    if (!outcome || !signature) return;
    setBusy(true);
    setError(null);
    try {
      await authedFetch(endpoint, { method, body: { outcome, comment: comment.trim() || undefined, signature } });
      const records = await authedFetch<ApprovalRecord[]>(`/projects/${projectId}/approval-records?subjectId=${subjectId}`).catch(() => [] as ApprovalRecord[]);
      setRecord(records[0] ?? null);
      onDecided();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Your decision could not be saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <div className="flex max-h-[94dvh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="decision-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {record ? 'Decision recorded' : 'Your decision'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{title}</p>
            {context && <p className="text-xs text-slate-500">{context}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {record ? (
          <div className="space-y-4 px-4 py-5">
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              {approving ? <CheckCircle2 size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />}
              Recorded as <strong>{OUTCOMES.find((o) => o.value === record.outcome)?.label}</strong>, signed by {record.signerName}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openSignedCopy(projectId, record.id, accessToken)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:h-9">
                <FileSignature size={15} /> Open the signed copy
              </button>
              <button type="button" onClick={onClose} className="h-11 rounded-lg border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50 sm:h-9 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {due && <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${dueTone(due)}`}>{due.text}</span>}
              {children}

              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Response</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OUTCOMES.map((o) => (
                    <label
                      key={o.value}
                      className={`flex min-h-14 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                        outcome === o.value
                          ? o.approve
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                            : 'border-red-500 bg-red-50 dark:bg-red-950/40'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      <input type="radio" name="outcome" className={`mt-0.5 h-4 w-4 ${o.approve ? 'accent-emerald-600' : 'accent-red-600'}`} checked={outcome === o.value} onChange={() => setOutcome(o.value)} />
                      <span>
                        <span className="block font-medium text-slate-900 dark:text-slate-100">{o.label}</span>
                        <span className="block text-xs text-slate-500">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Comments {needsComment ? <span className="text-red-600">(required)</span> : <span className="font-normal normal-case">(optional)</span>}
                </span>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white p-2 text-base sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={needsComment ? 'Say what has to change, or what to take into account' : ''}
                />
              </label>

              <SignaturePad onChange={setSignature} />

              <p className="text-xs text-slate-500">
                By confirming, {user?.fullName ?? 'you'} electronically sign this decision. Your name, the date and time are recorded, and your signature is added to the document.
              </p>
              {error && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-lg px-4 text-sm text-slate-600 hover:bg-slate-100 sm:h-9 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!ready || busy}
                className={`inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50 sm:h-9 ${approving || !outcome ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? 'Signing…' : 'Confirm and sign'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
