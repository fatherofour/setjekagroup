'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, X as XIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { PROJECT_STAGES, projectStageInfo, type ProjectStage } from '@/lib/projectStages';

interface StageTransition {
  id: string;
  fromStage: ProjectStage;
  toStage: ProjectStage;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestComment: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; fullName: string };
  decidedBy: { id: string; fullName: string } | null;
}

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function nextStage(current: ProjectStage): ProjectStage | null {
  const idx = PROJECT_STAGES.findIndex((s) => s.value === current);
  return idx >= 0 && idx < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[idx + 1].value : null;
}

export function StageGatePanel({ currentStage, projectId, onStageChanged }: { currentStage: ProjectStage; projectId: string; onStageChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [transitions, setTransitions] = useState<StageTransition[] | null>(null);
  const [comment, setComment] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
  const history = transitions?.filter((t) => t.status !== 'PENDING') ?? [];

  async function requestAdvance() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/stage-transitions`, {
        method: 'POST',
        body: { toStage: target, comment: comment.trim() || undefined },
      });
      setComment('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to request the stage change.');
    } finally {
      setSaving(false);
    }
  }

  async function decide(approve: boolean) {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/stage-transitions/${pending.id}/decide`, {
        method: 'PATCH',
        body: { approve, comment: decisionComment.trim() || undefined },
      });
      setDecisionComment('');
      load();
      onStageChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record the decision.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Stage gate</h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {projectStageInfo(currentStage).label}
        </span>
        {target && (
          <>
            <ArrowRight size={14} className="text-slate-300" />
            <span className="text-slate-400">{projectStageInfo(target).label}</span>
          </>
        )}
      </div>

      {pending ? (
        <div className="rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          <p className="text-amber-800 dark:text-amber-300">
            <span className="font-medium">{pending.requestedBy.fullName}</span> requested advancing to{' '}
            <span className="font-medium">{projectStageInfo(pending.toStage).label}</span>
          </p>
          {pending.requestComment && <p className="mt-1 text-amber-700 dark:text-amber-400">{pending.requestComment}</p>}
          <input
            className={`${inputClass} mt-2 w-full`}
            placeholder="Decision comment (optional)"
            value={decisionComment}
            onChange={(e) => setDecisionComment(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => decide(true)}
              disabled={saving}
              className="flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Check size={13} />
              Approve
            </button>
            <button
              onClick={() => decide(false)}
              disabled={saving}
              className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <XIcon size={13} />
              Reject
            </button>
          </div>
        </div>
      ) : target ? (
        <div className="space-y-2">
          <input
            className={`${inputClass} w-full`}
            placeholder={`Why advance to ${projectStageInfo(target).label}? (optional)`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            onClick={requestAdvance}
            disabled={saving}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Request advancement to {projectStageInfo(target).label}
          </button>
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
                  <span className={t.status === 'APPROVED' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                    {t.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  </span>
                  <span className="ml-2 text-slate-400">
                    by {t.decidedBy?.fullName ?? '—'} · {t.decidedAt ? new Date(t.decidedAt).toLocaleString() : ''}
                  </span>
                  {t.decisionComment && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{t.decisionComment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
