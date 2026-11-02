'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';

interface PriceIndex {
  id: string;
  code: string;
  name: string;
  source: string | null;
  values: { month: string; value: number }[];
}

interface EscalationConfig {
  baseMonth: string | null;
  fixedPct: number;
  lagMonths: number;
  weights: { indexId: string; code: string; name: string; weight: number }[];
}

const errText = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const ym = (iso: string) => iso.slice(0, 7);
const monthName = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The cost indices contract price adjustment runs on (Stats SA's CPAP
 * series and the like), kept once for every project. */
export function PriceIndicesPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<PriceIndex[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', source: '' });
  const [entry, setEntry] = useState({ indexId: '', month: '', value: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/qs/price-indices`;

  useEffect(() => {
    authedFetch<PriceIndex[]>(base)
      .then(setRows)
      .catch((e) => setError(errText(e, 'Failed to load the price indices.')));
  }, [authedFetch, base]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errText(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const x = await authedFetch<PriceIndex>(base, { method: 'POST', body: { code: form.code.trim(), name: form.name.trim(), source: form.source.trim() || undefined } });
      setRows([...(rows ?? []), x].sort((a, b) => a.code.localeCompare(b.code)));
      setForm({ code: '', name: '', source: '' });
      setAdding(false);
    });
  };

  const enter = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const x = await authedFetch<PriceIndex>(`${base}/${entry.indexId}/values`, { method: 'PUT', body: { values: [{ month: entry.month, value: Number(entry.value) }] } });
      setRows((rows ?? []).map((r) => (r.id === x.id ? x : r)));
      setEntry({ ...entry, value: '' });
    });
  };

  // The last six months any index has a value for, newest first.
  const months = [...new Set((rows ?? []).flatMap((r) => r.values.map((v) => ym(v.month))))].sort().reverse().slice(0, 6);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Price indices</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              The indices contract price adjustment runs on, such as Stats SA&apos;s labour, plant, materials and fuel series. They are shared by every project. Enter each month&apos;s value as it is published; draft valuations that use it update straight away.
            </p>
          </div>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
              <Plus size={14} /> Add an index
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {adding && (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <div>
              <label className={labelClass} htmlFor="pi-code">
                Code
              </label>
              <input id="pi-code" className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. LABOUR" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="pi-name">
                Name
              </label>
              <input id="pi-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Labour (civil)" />
            </div>
            <div>
              <label className={labelClass} htmlFor="pi-source">
                Source
              </label>
              <input id="pi-source" className={inputClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Stats SA P0151" />
            </div>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={busy || !form.code.trim() || !form.name.trim()} className={primaryButton}>
                Add
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {rows && rows.length > 0 && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Enter a month&apos;s value</h3>
          <form onSubmit={enter} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="pi-index">
                Index
              </label>
              <Select id="pi-index" className={inputClass} value={entry.indexId} onChange={(v) => setEntry({ ...entry, indexId: v })} options={[{ value: '', label: 'Choose…' }, ...rows.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))]} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pi-month">
                Month
              </label>
              <input id="pi-month" type="month" className={inputClass} value={entry.month} onChange={(e) => setEntry({ ...entry, month: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pi-value">
                Value
              </label>
              <input id="pi-value" type="number" min={0} step="any" className={`${inputClass} text-right`} value={entry.value} onChange={(e) => setEntry({ ...entry, value: e.target.value })} />
            </div>
            <div className="sm:col-span-4">
              <button type="submit" disabled={busy || !entry.indexId || !entry.month || !(Number(entry.value) > 0)} className={primaryButton}>
                Save the value
              </button>
            </div>
          </form>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-2">Index</th>
                  {months.map((m) => (
                    <th key={m} className="w-20 py-2 pr-2 text-right">
                      {monthName(`${m}-01T00:00:00Z`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-100">
                      <span className="font-mono text-slate-500">{r.code}</span> {r.name}
                      {r.source && <span className="block text-[11px] text-slate-400">{r.source}</span>}
                    </td>
                    {months.map((m) => (
                      <td key={m} className="py-1.5 pr-2 text-right tabular-nums">
                        {r.values.find((v) => ym(v.month) === m)?.value ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows && rows.length === 0 && <p className={`${cardClass} text-sm text-slate-400`}>No price indices yet.</p>}
    </div>
  );
}

/** A contract's price adjustment: its base month, fixed share, index lag
 * and weightings. Fixed once a valuation is certified. */
export function PriceAdjustmentCard({ projectId, contractId, locked, onSaved }: { projectId: string; contractId: string; locked: boolean; onSaved: () => void }) {
  const { authedFetch } = useAuth();
  const [cfg, setCfg] = useState<EscalationConfig | null>(null);
  const [indices, setIndices] = useState<PriceIndex[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ baseMonth: '', fixedPct: '15', lagMonths: '0', weights: [] as { indexId: string; weight: string }[] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/projects/${projectId}/qs/contracts/${contractId}/escalation`;

  useEffect(() => {
    Promise.all([authedFetch<EscalationConfig>(url), authedFetch<PriceIndex[]>(`/projects/${projectId}/qs/price-indices`)])
      .then(([c, i]) => {
        setCfg(c);
        setIndices(i);
      })
      .catch((e) => setError(errText(e, 'Failed to load the price adjustment.')));
  }, [authedFetch, projectId, url]);

  const start = () => {
    if (!cfg) return;
    setForm({
      baseMonth: cfg.baseMonth ? ym(cfg.baseMonth) : '',
      fixedPct: String(cfg.fixedPct),
      lagMonths: String(cfg.lagMonths),
      weights: cfg.weights.length ? cfg.weights.map((w) => ({ indexId: w.indexId, weight: String(w.weight) })) : [{ indexId: '', weight: '' }],
    });
    setEditing(true);
  };

  const total = form.weights.reduce((s, w) => s + (Number(w.weight) || 0), 0);
  const save = async (weights: { indexId: string; weight: number }[]) => {
    setError(null);
    setBusy(true);
    try {
      setCfg(await authedFetch<EscalationConfig>(url, { method: 'PUT', body: { baseMonth: form.baseMonth || undefined, fixedPct: Number(form.fixedPct), lagMonths: Number(form.lagMonths) || 0, weights } }));
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(errText(e, 'Failed to save the price adjustment.'));
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) return error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null;
  const on = cfg.weights.length > 0;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contract price adjustment</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            {on
              ? `Each valuation adjusts its period's work (not dayworks) by the weighted indices against ${monthName(cfg.baseMonth!)}, with ${cfg.fixedPct}% fixed${cfg.lagMonths ? ` and the indices ${cfg.lagMonths} month${cfg.lagMonths > 1 ? 's' : ''} behind` : ''}.`
              : 'This contract is at fixed prices. Add index weightings from the contract data to adjust each valuation for price changes.'}
            {locked && ' Fixed now that a valuation has been certified.'}
          </p>
        </div>
        {!locked && !editing && (
          <button type="button" onClick={start} className={secondaryButton}>
            {on ? 'Change' : 'Set up'}
          </button>
        )}
      </div>
      {on && !editing && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {cfg.weights.map((w) => (
            <li key={w.indexId} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {w.name} <span className="tabular-nums font-medium">{w.weight}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(form.weights.filter((w) => w.indexId).map((w) => ({ indexId: w.indexId, weight: Number(w.weight) || 0 })));
          }}
          className="mt-4 space-y-3"
        >
          {!indices.length && <p className="text-xs text-amber-700 dark:text-amber-400">Add the price indices first, on the Price indices tab.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="cpa-base">
                Base month
              </label>
              <input id="cpa-base" type="month" className={inputClass} value={form.baseMonth} onChange={(e) => setForm({ ...form, baseMonth: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="cpa-fixed">
                Fixed, not adjusted (%)
              </label>
              <input id="cpa-fixed" type="number" min={0} max={100} step="any" className={`${inputClass} text-right`} value={form.fixedPct} onChange={(e) => setForm({ ...form, fixedPct: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="cpa-lag">
                Index lag (months)
              </label>
              <input id="cpa-lag" type="number" min={0} max={12} step={1} className={`${inputClass} text-right`} value={form.lagMonths} onChange={(e) => setForm({ ...form, lagMonths: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            {form.weights.map((w, k) => (
              <div key={k} className="flex gap-2">
                <Select
                  aria-label={`Index ${k + 1}`}
                  className={`${inputClass} min-w-0 flex-1`}
                  value={w.indexId}
                  onChange={(v) => setForm({ ...form, weights: form.weights.map((x, j) => (j === k ? { ...x, indexId: v } : x)) })}
                  options={[{ value: '', label: 'Choose an index…' }, ...indices.map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }))]}
                />
                <input aria-label={`Weighting ${k + 1}`} type="number" min={0} max={1} step="any" className={`${inputClass} w-24 text-right`} value={w.weight} onChange={(e) => setForm({ ...form, weights: form.weights.map((x, j) => (j === k ? { ...x, weight: e.target.value } : x)) })} placeholder="0.40" />
                <button type="button" aria-label={`Remove index ${k + 1}`} onClick={() => setForm({ ...form, weights: form.weights.filter((_, j) => j !== k) })} className={secondaryButton}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => setForm({ ...form, weights: [...form.weights, { indexId: '', weight: '' }] })} className={secondaryButton}>
                <Plus size={14} /> Add an index
              </button>
              <span className={`text-xs tabular-nums ${Math.abs(total - 1) < 0.0005 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>Weightings add to {Math.round(total * 1000) / 1000} (must be 1)</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || Math.abs(total - 1) > 0.0005 || !form.baseMonth} className={primaryButton}>
              Save
            </button>
            {on && (
              <button type="button" disabled={busy} onClick={() => confirm('Turn off price adjustment on this contract?') && save([])} className={secondaryButton}>
                Turn off
              </button>
            )}
            <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
