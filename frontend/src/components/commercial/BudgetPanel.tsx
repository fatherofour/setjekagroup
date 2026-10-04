'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Lock, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { formatRate, type CostCode } from '@/lib/commercial';

interface Budget {
  currency: string;
  contingencyPctGuide: number | null;
  budget: {
    contingencyAmount: number;
    lockedAt: string | null;
    lockedBy: { fullName: string } | null;
    notes: string | null;
    sourceEstimate: { id: string; reference: string; name: string } | null;
  } | null;
  lines: { id: string; amount: number; description: string | null; costCode: { id: string; code: string; name: string } }[];
  total: number;
  contingency: number;
  totalWithContingency: number;
}

/** Register COM "Project budget": the approved budget by cost code, with
 * contingency held separately (Meeting 002, 2.5). Locked once approved;
 * after that it only moves through variations. */
export function BudgetPanel({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<Budget | null>(null);
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [form, setForm] = useState({ costCodeId: '', amount: '', description: '' });
  const [contingency, setContingency] = useState('');
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/commercial/budget`;

  const apply = useCallback((b: Budget) => {
    setData(b);
    setContingency(String(b.contingency));
  }, []);

  useEffect(() => {
    authedFetch<Budget>(base)
      .then(apply)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the budget.'));
    authedFetch<CostCode[]>('/cost-codes').then(setCodes).catch(() => {});
  }, [authedFetch, base, apply]);

  async function run(fn: () => Promise<Budget>) {
    setError(null);
    try {
      apply(await fn());
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  function addLine(e: FormEvent) {
    e.preventDefault();
    run(() => authedFetch<Budget>(`${base}/lines`, { method: 'POST', body: { costCodeId: form.costCodeId, amount: Number(form.amount), description: form.description.trim() || undefined } })).then(() =>
      setForm({ costCodeId: '', amount: '', description: '' }),
    );
  }

  if (error && !data) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  const locked = Boolean(data.budget?.lockedAt);
  const cur = data.currency;
  const suggested = data.contingencyPctGuide != null ? (data.total * data.contingencyPctGuide) / 100 : null;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Project budget ({cur})</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              {locked
                ? `Locked as the approved budget${data.budget?.lockedBy ? ` by ${data.budget.lockedBy.fullName}` : ''} on ${new Date(data.budget!.lockedAt!).toLocaleDateString()}. Changes now come through variations.`
                : 'Build the budget by cost code, or adopt a final estimate. Lock it once it is approved; from then on it moves only through variations.'}
              {data.budget?.sourceEstimate && (
                <>
                  {' '}
                  From estimate{' '}
                  <Link href={`/estimates/${data.budget.sourceEstimate.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    {data.budget.sourceEstimate.reference}
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
          {locked ? (
            <button type="button" onClick={() => confirm('Unlock the budget for editing?') && run(() => authedFetch<Budget>(`${base}/unlock`, { method: 'POST' }))} className={secondaryButton}>
              <Unlock size={14} />
              Unlock
            </button>
          ) : (
            <button type="button" disabled={!data.lines.length} onClick={() => confirm('Lock this as the approved budget?') && run(() => authedFetch<Budget>(`${base}/lock`, { method: 'POST' }))} className={primaryButton}>
              <Lock size={14} />
              Lock as approved budget
            </button>
          )}
        </div>

        {!locked && (
          <form onSubmit={addLine} className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
            <div className="w-60">
              <label className={labelClass} htmlFor="bl-code">
                Cost code
              </label>
              <Select id="bl-code" value={form.costCodeId} onChange={(v) => setForm({ ...form, costCodeId: v })} options={[{ value: '', label: 'Choose…' }, ...codes.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))]} className={inputClass} />
            </div>
            <div className="min-w-[180px] flex-1">
              <label className={labelClass} htmlFor="bl-desc">
                Description
              </label>
              <input id="bl-desc" className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="w-40">
              <label className={labelClass} htmlFor="bl-amount">
                Amount
              </label>
              <input id="bl-amount" type="number" min={0} step="any" className={`${inputClass} text-right`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <button type="submit" disabled={!form.costCodeId || form.amount === ''} className={primaryButton}>
              Add line
            </button>
          </form>
        )}

        {data.lines.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No budget lines yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="w-12 py-2 font-mono text-xs text-slate-400">{l.costCode.code}</td>
                  <td className="py-2 text-slate-800 dark:text-slate-100">
                    {l.costCode.name}
                    {l.description && <span className="ml-2 text-xs text-slate-400">{l.description}</span>}
                  </td>
                  <td className="w-40 py-2 text-right">
                    {locked ? (
                      <span className="tabular-nums">{formatRate(l.amount)}</span>
                    ) : (
                      <input
                        aria-label={`Amount for ${l.costCode.name}`}
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={l.amount}
                        onBlur={(e) => Number(e.target.value) !== l.amount && run(() => authedFetch<Budget>(`${base}/lines/${l.id}`, { method: 'PATCH', body: { amount: Number(e.target.value) } }))}
                        className={`${inputClass} h-8 text-right tabular-nums`}
                      />
                    )}
                  </td>
                  <td className="w-10 py-2 text-right">
                    {!locked && (
                      <button type="button" aria-label={`Remove ${l.costCode.name}`} onClick={() => run(() => authedFetch<Budget>(`${base}/lines/${l.id}`, { method: 'DELETE' }))} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td />
                <td className="py-2 text-slate-900 dark:text-slate-100">Budget excluding contingency</td>
                <td className="py-2 text-right tabular-nums">{formatRate(data.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contingency</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Held against the budget, conventionally 20–30% of project cost. Approved variations draw it down and omissions return to it; the balance is on the cost report.
          {suggested != null && ` At this project's ${data.contingencyPctGuide}% that is ${formatRate(suggested, cur)}.`}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-48">
            <label className={labelClass} htmlFor="contingency">
              Contingency amount ({cur})
            </label>
            <input id="contingency" type="number" min={0} step="any" disabled={locked} className={`${inputClass} text-right`} value={contingency} onChange={(e) => setContingency(e.target.value)} />
          </div>
          {!locked && (
            <>
              <button type="button" disabled={Number(contingency) === data.contingency} onClick={() => run(() => authedFetch<Budget>(base, { method: 'PUT', body: { contingencyAmount: Number(contingency) } }))} className={primaryButton}>
                Save
              </button>
              {suggested != null && (
                <button type="button" onClick={() => setContingency(String(Math.round(suggested)))} className={secondaryButton}>
                  Use {data.contingencyPctGuide}%
                </button>
              )}
            </>
          )}
          <p className="ml-auto text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">Budget with contingency: {formatRate(data.totalWithContingency, cur)}</p>
        </div>
      </div>
    </div>
  );
}
