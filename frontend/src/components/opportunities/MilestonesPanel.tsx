'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Flag, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, inputClass, primaryButton, secondaryButton } from '@/lib/stage0';

type Status = 'COMPLETED' | 'COMPLETED_LATE' | 'OVERDUE' | 'SLIPPED' | 'ON_TRACK' | 'NOT_SCHEDULED';

interface Milestone {
  id: string;
  name: string;
  key: string | null;
  baselineDate: string | null;
  targetDate: string | null;
  actualDate: string | null;
  status: Status;
  varianceDays: number | null;
}

const STATUS_LABEL: Record<Status, string> = {
  COMPLETED: 'Complete',
  COMPLETED_LATE: 'Complete — late',
  OVERDUE: 'Overdue',
  SLIPPED: 'Slipped',
  ON_TRACK: 'On track',
  NOT_SCHEDULED: 'Not scheduled',
};
const STATUS_TONE: Record<Status, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  COMPLETED_LATE: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  OVERDUE: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  SLIPPED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ON_TRACK: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  NOT_SCHEDULED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const day = (v: string | null) => (v ? v.slice(0, 10) : '');

/** Register DEV R12 "Development milestones — concept through handover;
 * baseline, target, actual and status". Shared by the opportunity and the
 * project (the same milestones carry over). Template milestones record
 * their actual date themselves when the event happens. */
export function MilestonesPanel({ basePath, readOnly = false }: { basePath: string; readOnly?: boolean }) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<Milestone[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    authedFetch<Milestone[]>(basePath)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load milestones.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  async function run(fn: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      const result = await fn();
      if (Array.isArray(result)) setRows(result as Milestone[]);
      else await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    }
  }

  const setDate = (m: Milestone, field: 'targetDate' | 'actualDate', value: string) =>
    run(() => authedFetch(`${basePath}/${m.id}`, { method: 'PATCH', body: { [field]: value || null } }), 'Failed to update.');

  async function add(e: FormEvent) {
    e.preventDefault();
    await run(() => authedFetch(basePath, { method: 'POST', body: { name: name.trim() } }), 'Failed to add.');
    setName('');
  }

  const unbaselined = rows?.filter((m) => !m.baselineDate && m.targetDate).length ?? 0;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Flag size={14} />
            Development milestones <span className="font-normal text-slate-400">· Register DEV R12</span>
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
            From Stage 0 through handover. Set target dates, then fix them as the baseline — later changes show as slippage. Template milestones fill in their own actual dates when the event happens.
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {rows && !rows.some((m) => m.key) && (
              <button type="button" onClick={() => run(() => authedFetch(`${basePath}/template`, { method: 'POST' }), 'Failed to add the template.')} className={primaryButton}>
                Add PROCSA milestones
              </button>
            )}
            {unbaselined > 0 && (
              <button type="button" onClick={() => run(() => authedFetch(`${basePath}/baseline`, { method: 'POST' }), 'Failed to set the baseline.')} className={secondaryButton}>
                Set baseline ({unbaselined})
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {rows === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No milestones yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400 dark:border-slate-800">
                <th className="py-1.5 pr-2 font-medium">Milestone</th>
                <th className="py-1.5 pr-2 font-medium">Baseline</th>
                <th className="py-1.5 pr-2 font-medium">Target</th>
                <th className="py-1.5 pr-2 font-medium">Actual</th>
                <th className="py-1.5 pr-2 font-medium">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-100">{m.name}</td>
                  <td className="py-1.5 pr-2 text-xs tabular-nums text-slate-500">{m.baselineDate ? new Date(m.baselineDate).toLocaleDateString() : '—'}</td>
                  <td className="py-1.5 pr-2">
                    {readOnly ? (
                      <span className="text-xs tabular-nums text-slate-600">{m.targetDate ? new Date(m.targetDate).toLocaleDateString() : '—'}</span>
                    ) : (
                      <input key={`t-${m.id}-${m.targetDate}`} aria-label={`Target for ${m.name}`} type="date" className={`${inputClass} h-8 w-36 text-xs`} defaultValue={day(m.targetDate)} onBlur={(e) => e.target.value !== day(m.targetDate) && setDate(m, 'targetDate', e.target.value)} />
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {readOnly ? (
                      <span className="text-xs tabular-nums text-slate-600">{m.actualDate ? new Date(m.actualDate).toLocaleDateString() : '—'}</span>
                    ) : (
                      <input key={`a-${m.id}-${m.actualDate}`} aria-label={`Actual for ${m.name}`} type="date" className={`${inputClass} h-8 w-36 text-xs`} defaultValue={day(m.actualDate)} onBlur={(e) => e.target.value !== day(m.actualDate) && setDate(m, 'actualDate', e.target.value)} />
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                    {m.varianceDays !== null && m.varianceDays !== 0 && <span className="ml-1 text-[11px] text-slate-400">{m.varianceDays > 0 ? `+${m.varianceDays}` : m.varianceDays}d</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    {!readOnly && !m.key && (
                      <button type="button" aria-label={`Delete ${m.name}`} onClick={() => run(() => authedFetch(`${basePath}/${m.id}`, { method: 'DELETE' }), 'Failed to delete.')} className="text-slate-400 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && (
        <form onSubmit={add} className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input aria-label="New milestone" className={`${inputClass} h-8 flex-1 text-xs`} placeholder="Add your own milestone, e.g. Funding secured" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()} className={`${secondaryButton} h-8`}>
            <Plus size={13} />
            Add
          </button>
        </form>
      )}
    </div>
  );
}
