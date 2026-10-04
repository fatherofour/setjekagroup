'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton } from '@/lib/stage0';
import { CURRENCY_OPTIONS, type Currency } from '@/lib/projectMeta';
import { COST_CODE_CATEGORY_LABEL, type CostCode, type CostCodeCategory } from '@/lib/commercial';

const CATEGORY_OPTIONS = (Object.keys(COST_CODE_CATEGORY_LABEL) as CostCodeCategory[]).map((c) => ({ value: c, label: COST_CODE_CATEGORY_LABEL[c] }));

/** The standard cost codes budgets, estimates, variations and orders are
 * coded against (register COM "Cost code structure"). */
export function CostCodesPanel({ codes, onChange }: { codes: CostCode[]; onChange: () => void }) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState({ code: '', name: '', category: 'WORKS' as CostCodeCategory });
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const sortOrder = Math.max(0, ...codes.map((c) => c.sortOrder)) + 10;
      await authedFetch('/cost-codes', { method: 'POST', body: { ...form, code: form.code.trim(), name: form.name.trim(), sortOrder } });
      setForm({ code: '', name: '', category: form.category });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the cost code.');
    }
  }

  async function update(c: CostCode, body: Partial<CostCode>) {
    setError(null);
    try {
      await authedFetch(`/cost-codes/${c.id}`, { method: 'PATCH', body });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the cost code.');
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost codes</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Budgets, estimates, variations and purchase orders are all coded against these, so the cost report lines up. Contingency is held separately on each budget.</p>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-24">
          <label className={labelClass} htmlFor="cc-code">
            Code
          </label>
          <input id="cc-code" className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass} htmlFor="cc-name">
            Name
          </label>
          <input id="cc-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="w-44">
          <label className={labelClass} htmlFor="cc-cat">
            Category
          </label>
          <Select id="cc-cat" value={form.category} onChange={(v) => setForm({ ...form, category: v as CostCodeCategory })} options={CATEGORY_OPTIONS} className={inputClass} />
        </div>
        <button type="submit" disabled={!form.code.trim() || !form.name.trim()} className={primaryButton}>
          Add code
        </button>
      </form>
      <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {codes.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-3 py-2 ${c.isActive ? '' : 'opacity-50'}`}>
            <span className="w-10 font-mono text-xs text-slate-500">{c.code}</span>
            <input
              aria-label={`Name of cost code ${c.code}`}
              defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update(c, { name: e.target.value.trim() })}
              className="min-w-[180px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 hover:border-slate-200 focus:border-emerald-600 focus:outline-none dark:text-slate-100 dark:hover:border-slate-700"
            />
            <span className="text-xs text-slate-400">{COST_CODE_CATEGORY_LABEL[c.category]}</span>
            <button type="button" onClick={() => update(c, { isActive: !c.isActive })} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              {c.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FxRate {
  id: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: number;
  effectiveDate: string;
  source: string | null;
  enteredBy: { fullName: string } | null;
}

/** Exchange rates Setjeka records, used when a contract or order is in
 * one currency and the project reports in another (Meeting 002, 2.12). */
export function FxRatesPanel() {
  const { authedFetch } = useAuth();
  const [rates, setRates] = useState<FxRate[] | null>(null);
  const [form, setForm] = useState({ fromCurrency: 'USD' as Currency, toCurrency: 'ZAR' as Currency, rate: '', effectiveDate: new Date().toISOString().slice(0, 10), source: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    authedFetch<FxRate[]>('/fx-rates')
      .then(setRates)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load rates.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await authedFetch('/fx-rates', { method: 'POST', body: { ...form, rate: Number(form.rate), source: form.source.trim() || undefined } });
      setForm({ ...form, rate: '', source: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the rate.');
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/fx-rates/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the rate.');
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exchange rates</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Used to report commitments and spend in another currency against a project&apos;s currency, and to bring a quote in another currency into a region&apos;s price sheet. The latest rate on or before the date is used; the opposite pair works too (1 ÷ rate).
      </p>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-28">
          <label className={labelClass} htmlFor="fx-from">
            1 unit of
          </label>
          <Select id="fx-from" value={form.fromCurrency} onChange={(v) => setForm({ ...form, fromCurrency: v as Currency })} options={CURRENCY_OPTIONS} className={inputClass} />
        </div>
        <div className="w-28">
          <label className={labelClass} htmlFor="fx-to">
            equals ×
          </label>
          <Select id="fx-to" value={form.toCurrency} onChange={(v) => setForm({ ...form, toCurrency: v as Currency })} options={CURRENCY_OPTIONS} className={inputClass} />
        </div>
        <div className="w-32">
          <label className={labelClass} htmlFor="fx-rate">
            Rate
          </label>
          <input id="fx-rate" type="number" min={0} step="any" className={inputClass} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
        </div>
        <div className="w-40">
          <label className={labelClass} htmlFor="fx-date">
            Effective
          </label>
          <input id="fx-date" type="date" className={inputClass} value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={labelClass} htmlFor="fx-src">
            Source
          </label>
          <input id="fx-src" className={inputClass} placeholder="e.g. SARB, bank quote" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </div>
        <button type="submit" disabled={!form.rate || Number(form.rate) <= 0 || form.fromCurrency === form.toCurrency} className={primaryButton}>
          Add rate
        </button>
      </form>
      {rates === null ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : rates.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No exchange rates recorded.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {rates.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="tabular-nums text-slate-800 dark:text-slate-100">
                1 {r.fromCurrency} = {r.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {r.toCurrency}
              </span>
              <span className="flex-1 text-xs text-slate-400">
                from {new Date(r.effectiveDate).toLocaleDateString()}
                {r.source && ` · ${r.source}`}
                {r.enteredBy && ` · ${r.enteredBy.fullName}`}
              </span>
              <button type="button" aria-label="Delete rate" onClick={() => remove(r.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
