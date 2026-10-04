'use client';

import { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, formatMoney, inputClass, isExecutive, primaryButton, secondaryButton } from '@/lib/stage0';

interface Decision {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestComment: string | null;
  decisionComment: string | null;
  createdAt: string;
  decidedAt: string | null;
  requestedBy: { id: string; fullName: string };
  decidedBy: { id: string; fullName: string } | null;
  snapshot: {
    client?: string;
    visionConfirmedAt?: string | null;
    currency?: string | null;
    businessCase?: { name: string; result: { totalDevelopmentCost: number; grossDevelopmentValue: number; profitOnCostPct: number | null; yieldOnCostPct: number | null; viable: boolean } };
    site?: { name: string; acquisitionStatus: string; agreedPrice: number | null } | null;
    landRights?: { status: string }[];
    marketResearch?: unknown[];
    consultants?: unknown[];
  } | null;
}

const TONE = {
  PENDING: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  REJECTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
} as const;

/** The Executive's go / no-go (register DEV rows: Executive). The
 * Development Manager puts the case forward; a Setjeka manager who didn't
 * ask decides, seeing exactly what was on file at the time. */
export function InvestmentDecisionPanel({ opportunityId, stage, onChanged }: { opportunityId: string; stage: string; onChanged: () => void }) {
  const { authedFetch, user } = useAuth();
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/opportunities/${opportunityId}/decisions`;

  useEffect(() => {
    authedFetch<Decision[]>(base)
      .then(setDecisions)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load decisions.'));
  }, [authedFetch, base]);

  async function act(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setDecisions(await authedFetch<Decision[]>(path, { method: 'POST', body }));
      setComment('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const pending = decisions?.find((d) => d.status === 'PENDING');
  const exec = isExecutive(user);
  const canRequest = !pending && ['IDENTIFIED', 'UNDER_EVALUATION', 'ON_HOLD'].includes(stage);
  const canDecide = pending && exec && pending.requestedBy.id !== user?.id;

  return (
    <div className={cardClass}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Gavel size={14} />
        Investment decision <span className="font-normal text-slate-400">· Executive</span>
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        The Development Manager puts the opportunity forward once the client, need and a preferred business case are on file. An Executive (a Setjeka manager) who didn&apos;t ask decides. Approval is what lets it move to Inception.
      </p>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {pending && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <p className="text-sm text-slate-800 dark:text-slate-100">
            Awaiting an Executive — requested by {pending.requestedBy.fullName} on {new Date(pending.createdAt).toLocaleDateString()}
          </p>
          {pending.requestComment && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">“{pending.requestComment}”</p>}
          {pending.snapshot && <SnapshotSummary snapshot={pending.snapshot} />}
          {canDecide && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input aria-label="Decision comment" className={`${inputClass} h-8 min-w-[200px] flex-1 text-xs`} placeholder="Comment (required to decline)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button type="button" disabled={busy} onClick={() => act(`${base}/${pending.id}/decide`, { approve: true, comment: comment || undefined })} className={primaryButton}>
                Approve — proceed
              </button>
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act(`${base}/${pending.id}/decide`, { approve: false, comment })} className={secondaryButton}>
                Decline
              </button>
            </div>
          )}
          {!canDecide && <p className="mt-2 text-xs text-slate-500">{exec ? 'You asked for this decision, so another Executive must make it.' : 'Only an Executive (a Setjeka manager) can decide.'}</p>}
        </div>
      )}

      {canRequest && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input aria-label="Note to the Executive" className={`${inputClass} h-8 min-w-[200px] flex-1 text-xs`} placeholder="Note to the Executive (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button type="button" disabled={busy} onClick={() => act(base, { comment: comment || undefined })} className={primaryButton}>
            Request investment decision
          </button>
        </div>
      )}

      {decisions && decisions.filter((d) => d.status !== 'PENDING').length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          {decisions
            .filter((d) => d.status !== 'PENDING')
            .map((d) => (
              <li key={d.id} className="text-xs text-slate-600 dark:text-slate-300">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[d.status]}`}>{d.status === 'APPROVED' ? 'Approved' : 'Declined'}</span>
                by {d.decidedBy?.fullName} on {d.decidedAt && new Date(d.decidedAt).toLocaleDateString()}
                {d.decisionComment && ` — ${d.decisionComment}`}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotSummary({ snapshot }: { snapshot: NonNullable<Decision['snapshot']> }) {
  const r = snapshot.businessCase?.result;
  const granted = snapshot.landRights?.filter((l) => l.status === 'APPROVED').length ?? 0;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-slate-400">Client</dt>
        <dd className="text-slate-700 dark:text-slate-200">
          {snapshot.client ?? '—'} {snapshot.visionConfirmedAt ? '· vision confirmed' : '· vision not confirmed'}
        </dd>
      </div>
      {r && (
        <>
          <div>
            <dt className="text-slate-400">Business case ({snapshot.businessCase!.name})</dt>
            <dd className="text-slate-700 dark:text-slate-200">
              Cost {formatMoney(r.totalDevelopmentCost, snapshot.currency)} · value {formatMoney(r.grossDevelopmentValue, snapshot.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Return</dt>
            <dd className={r.viable ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600'}>
              {r.profitOnCostPct?.toFixed(1)}% on cost{r.yieldOnCostPct !== null ? ` · ${r.yieldOnCostPct.toFixed(1)}% yield` : ''}
            </dd>
          </div>
        </>
      )}
      <div>
        <dt className="text-slate-400">Site</dt>
        <dd className="text-slate-700 dark:text-slate-200">{snapshot.site ? `${snapshot.site.name} · ${snapshot.site.acquisitionStatus.replace(/_/g, ' ').toLowerCase()}` : 'None selected'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Land rights</dt>
        <dd className="text-slate-700 dark:text-slate-200">
          {granted} of {snapshot.landRights?.length ?? 0} granted
        </dd>
      </div>
      <div>
        <dt className="text-slate-400">Research · consultants</dt>
        <dd className="text-slate-700 dark:text-slate-200">
          {snapshot.marketResearch?.length ?? 0} report(s) · {snapshot.consultants?.length ?? 0} appointed
        </dd>
      </div>
    </dl>
  );
}
