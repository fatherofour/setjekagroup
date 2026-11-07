'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Stamp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { PROJECT_STAGES, projectStageInfo, type ProjectStage } from '@/lib/projectStages';
import { OUTCOME_LABEL, defaultDueDate, dueLabel, dueTone, todayInput, type ApprovalOutcome } from '@/lib/signoff';
import { DecisionDialog } from '@/components/signoff/DecisionDialog';
import { SignedCopies } from '@/components/signoff/SignedCopies';

interface StageTransition {
  id: string;
  fromStage: ProjectStage;
  toStage: ProjectStage;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ADVANCED_BY_SETJEKA';
  requestComment: string | null;
  decisionComment: string | null;
  decisionOutcome: ApprovalOutcome | null;
  responseDueAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; fullName: string };
  decidedBy: { id: string; fullName: string } | null;
  overriddenByName: string | null;
  overrideReason: string | null;
  overriddenAt: string | null;
}

const inputClass = 'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function nextStage(current: ProjectStage): ProjectStage | null {
  const idx = PROJECT_STAGES.findIndex((s) => s.value === current);
  return idx >= 0 && idx < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[idx + 1].value : null;
}

export function StageGatePanel({ currentStage, projectId, onStageChanged }: { currentStage: ProjectStage; projectId: string; onStageChanged: () => void }) {
  const { authedFetch, user } = useAuth();
  const [transitions, setTransitions] = useState<StageTransition[] | null>(null);
  const [comment, setComment] = useState('');
  const [dueBy, setDueBy] = useState(defaultDueDate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [reason, setReason] = useState('');
  // Setjeka requests stage moves and can advance without waiting; the client
  // signs them off (7 Nov 2026).
  const setjeka = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';

  const load = () => {
    authedFetch<StageTransition[]>(`/projects/${projectId}/stage-transitions`)
      .then(setTransitions)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load stage transitions.'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const target = nextStage(currentStage);
  const pending = transitions?.find((t) => t.status === 'PENDING') ?? null;
  // Advanced by Setjeka, with the client's sign-off still to come.
  const unsigned = transitions?.find((t) => t.status === 'ADVANCED_BY_SETJEKA' && !t.decidedAt) ?? null;
  const history = transitions?.filter((t) => t.status !== 'PENDING') ?? [];
  const toSign = pending ?? unsigned;
  const due = dueLabel(pending?.responseDueAt);

  async function advanceWithoutClient() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/stage-transitions/${pending.id}/advance`, { method: 'PATCH', body: { reason: reason.trim() } });
      setAdvancing(false);
      setReason('');
      load();
      onStageChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The project could not be advanced.');
    } finally {
      setSaving(false);
    }
  }

  async function requestAdvance() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/stage-transitions`, {
        method: 'POST',
        body: { toStage: target, comment: comment.trim() || undefined, responseDueAt: dueBy || undefined },
      });
      setComment('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to request the stage change.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Stage gate</h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{projectStageInfo(currentStage).label}</span>
        {target && (
          <>
            <ArrowRight size={14} className="text-slate-300" />
            <span className="text-slate-400">{projectStageInfo(target).label}</span>
          </>
        )}
      </div>

      {unsigned && (
        <div className="mb-3 rounded-md bg-sky-50 p-3 text-sm dark:bg-sky-950/40">
          <p className="text-sky-800 dark:text-sky-300">
            {unsigned.overriddenByName ?? 'Setjeka'} advanced to <span className="font-medium">{projectStageInfo(unsigned.toStage).label}</span> without the client&apos;s sign-off
            {unsigned.overriddenAt ? ` on ${new Date(unsigned.overriddenAt).toLocaleDateString()}` : ''}. The client&apos;s sign-off is still requested.
          </p>
          {unsigned.overrideReason && <p className="mt-1 text-xs text-sky-700 dark:text-sky-400">Reason: {unsigned.overrideReason}</p>}
          {!setjeka && (
            <button type="button" onClick={() => setDeciding(true)} className="mt-2 flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
              <Stamp size={13} />
              Review and sign
            </button>
          )}
        </div>
      )}

      {pending ? (
        <div className="rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          <p className="text-amber-800 dark:text-amber-300">
            <span className="font-medium">{pending.requestedBy.fullName}</span> requested advancing to <span className="font-medium">{projectStageInfo(pending.toStage).label}</span>
          </p>
          {pending.requestComment && <p className="mt-1 text-amber-700 dark:text-amber-400">{pending.requestComment}</p>}
          {due && <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${dueTone(due)}`}>{due.text}</span>}
          {setjeka ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-amber-700 dark:text-amber-400">Waiting for the client&apos;s sign-off. They have been notified in the platform and by email.</p>
              {advancing ? (
                <div className="space-y-2 rounded-md border border-amber-200 bg-white p-2 dark:border-amber-900 dark:bg-slate-900">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">
                    Why move on without the client&apos;s sign-off? <span className="text-red-600">(required)</span>
                    <textarea
                      className="mt-1 min-h-16 w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. The client is travelling until the 20th and the works can't wait"
                    />
                  </label>
                  <p className="text-xs text-slate-500">The project moves to {projectStageInfo(pending.toStage).label} now. The reason is kept on the record, and the client is still asked to sign.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={advanceWithoutClient} disabled={saving || reason.trim().length < 5} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                      {saving ? 'Advancing…' : `Advance to ${projectStageInfo(pending.toStage).label}`}
                    </button>
                    <button type="button" onClick={() => setAdvancing(false)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAdvancing(true)} className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950">
                  Advance without the client&apos;s sign-off…
                </button>
              )}
            </div>
          ) : (
            pending.requestedBy.id !== user?.id && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setDeciding(true)}
                  className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                >
                  <Stamp size={13} />
                  Review and sign
                </button>
              </div>
            )
          )}
        </div>
      ) : target ? (
        <div className="space-y-2">
          <input className={`${inputClass} w-full`} placeholder={`Why advance to ${projectStageInfo(target).label}? (optional)`} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Respond by
              <input type="date" min={todayInput()} className={inputClass} value={dueBy} onChange={(e) => setDueBy(e.target.value)} />
            </label>
            <button onClick={requestAdvance} disabled={saving} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              Request advancement to {projectStageInfo(target).label}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">This project is at its final stage.</p>
      )}

      {history.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
          <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            {showHistory ? 'Hide' : 'Show'} history ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1.5">
              {history.map((t) => (
                <li key={t.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {projectStageInfo(t.fromStage).label} → {projectStageInfo(t.toStage).label}
                  </span>{' '}
                  {t.status === 'ADVANCED_BY_SETJEKA' && <span className="mr-1 text-sky-700 dark:text-sky-400">Advanced by {t.overriddenByName ?? 'Setjeka'} ·</span>}
                  <span
                    className={
                      (t.decisionOutcome ? t.decisionOutcome.startsWith('APPROVED') : t.status === 'APPROVED')
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : t.status === 'ADVANCED_BY_SETJEKA' && !t.decisionOutcome
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }
                  >
                    {t.decisionOutcome
                      ? `${t.status === 'ADVANCED_BY_SETJEKA' ? 'Client: ' : ''}${OUTCOME_LABEL[t.decisionOutcome]}`
                      : t.status === 'APPROVED'
                        ? 'Approved'
                        : t.status === 'ADVANCED_BY_SETJEKA'
                          ? "client's sign-off outstanding"
                          : 'Rejected'}
                  </span>
                  <span className="ml-2 text-slate-400">
                    by {t.decidedBy?.fullName ?? '—'} · {t.decidedAt ? new Date(t.decidedAt).toLocaleString() : ''}
                  </span>
                  {t.overrideReason && <p className="mt-0.5 text-slate-500 dark:text-slate-400">Reason for advancing: {t.overrideReason}</p>}
                  {t.decisionComment && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{t.decisionComment}</p>}
                  <div className="mt-1">
                    <SignedCopies projectId={projectId} subjectId={t.id} compact />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {deciding && toSign && (
        <DecisionDialog
          projectId={projectId}
          title={`${projectStageInfo(toSign.fromStage).label} to ${projectStageInfo(toSign.toStage).label}`}
          context="Stage gate sign-off"
          dueAt={toSign.responseDueAt}
          endpoint={`/projects/${projectId}/stage-transitions/${toSign.id}/decide`}
          method="PATCH"
          subjectId={toSign.id}
          onClose={() => setDeciding(false)}
          onDecided={() => {
            load();
            onStageChanged();
          }}
        />
      )}
    </div>
  );
}
