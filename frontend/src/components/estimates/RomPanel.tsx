'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Calculator, Save, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardCls, fmtDay, inputCls, labelCls, primaryBtn, selectCls } from '@/lib/architect';

export interface RomRate {
  id: string;
  buildingType: string;
  label: string;
  quality: 'ECONOMY' | 'STANDARD' | 'PRESTIGE';
  ratePerM2: number;
  currency: string;
  updatedAt: string;
  updatedBy: { fullName: string } | null;
}
export interface RomTable {
  rates: RomRate[];
  regions: { id: string; region: string; factor: number }[];
  qualities: string[];
  vat: number;
}
interface Calc {
  label: string;
  quality: string;
  region: string;
  gfa: number;
  baseRate: number;
  regionFactor: number;
  escalationPct: number;
  contingencyPct: number;
  currency: string;
  elements: { element: string; pct: number; amount: number; perM2: number }[];
  construction: number;
  escalation: number;
  contingency: number;
  net: number;
  vat: number;
  total: number;
  ratePerM2All: number;
}
interface Saved {
  id: string;
  name: string;
  total: number;
  currency: string;
  gfa: number;
  quality: string;
  region: string;
  breakdown: Calc;
  notes: string | null;
  createdAt: string;
  createdBy: { fullName: string };
  project: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

export const QUALITY_LABEL: Record<string, string> = { ECONOMY: 'Economy', STANDARD: 'Standard', PRESTIGE: 'Prestige' };
export const money = (n: number, currency = 'ZAR') => n.toLocaleString('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 });
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

/** The rough order-of-magnitude estimate: floor area x a rate per m² for the
 * building type and quality, adjusted for the province, escalated, with
 * contingency and VAT, split by element. Saved against a project or an
 * opportunity; without one it is a quick calculation only. */
export function RomPanel({ projectId, opportunityId, scopePicker }: { projectId?: string; opportunityId?: string; scopePicker?: React.ReactNode }) {
  const { authedFetch } = useAuth();
  const [table, setTable] = useState<RomTable | null>(null);
  const [input, setInput] = useState({ buildingType: 'OFFICE', quality: 'STANDARD', region: 'Gauteng', gfa: '1000', escalationPct: '0', contingencyPct: '10', name: '', notes: '' });
  const [calc, setCalc] = useState<Calc | null>(null);
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const scoped = Boolean(projectId || opportunityId);
  const scopeQuery = projectId ? `projectId=${projectId}` : opportunityId ? `opportunityId=${opportunityId}` : '';

  useEffect(() => {
    authedFetch<RomTable>('/rom/rates')
      .then(setTable)
      .catch((e) => setError(err(e, 'Could not load the rate table')));
  }, [authedFetch]);

  const loadSaved = useCallback(() => {
    if (!scoped) return;
    authedFetch<Saved[]>(`/rom/estimates?${scopeQuery}`)
      .then(setSaved)
      .catch(() => setSaved([]));
  }, [authedFetch, scoped, scopeQuery]);
  useEffect(loadSaved, [loadSaved]);

  const body = useMemo(
    () => ({ buildingType: input.buildingType, quality: input.quality, region: input.region, gfa: Number(input.gfa), escalationPct: Number(input.escalationPct) || 0, contingencyPct: Number(input.contingencyPct) || 0 }),
    [input.buildingType, input.quality, input.region, input.gfa, input.escalationPct, input.contingencyPct],
  );

  useEffect(() => {
    if (!table || !(body.gfa >= 10)) return;
    const t = setTimeout(() => {
      authedFetch<Calc>('/rom/calculate', { method: 'POST', body })
        .then((c) => (setCalc(c), setError(null)))
        .catch((e) => setError(err(e, 'Could not work it out')));
    }, 300);
    return () => clearTimeout(t);
  }, [authedFetch, table, body]);

  async function save() {
    setError(null);
    setOkMsg(null);
    try {
      await authedFetch('/rom/estimates', { method: 'POST', body: { ...body, projectId, opportunityId, name: input.name.trim() || undefined, notes: input.notes.trim() || undefined } });
      setOkMsg('Saved.');
      setInput({ ...input, name: '', notes: '' });
      loadSaved();
    } catch (e) {
      setError(err(e, 'Could not save the estimate'));
    }
  }

  async function remove(s: Saved) {
    if (!confirm(`Delete the estimate "${s.name}"?`)) return;
    try {
      await authedFetch(`/rom/estimates/${s.id}`, { method: 'DELETE' });
      loadSaved();
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  const types = useMemo(() => {
    const m = new Map<string, string>();
    table?.rates.forEach((r) => m.set(r.buildingType, r.label));
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [table]);
  const set = (k: keyof typeof input) => (v: string) => setInput((i) => ({ ...i, [k]: v }));

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Calculator size={15} /> Rough cost estimate
        </h2>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-500">An order-of-magnitude figure for early decisions, before there is a bill of quantities. Excludes land, professional fees and finance. Rates are Setjeka&apos;s indicative table, which the QS keeps up to date.</p>
        {scopePicker}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className={`${labelCls} lg:col-span-2`}>
            Building type
            <Select className={`${selectCls} mt-0.5 w-full`} value={input.buildingType} onChange={set('buildingType')} options={types} aria-label="Building type" />
          </div>
          <div className={labelCls}>
            Quality
            <Select className={`${selectCls} mt-0.5 w-full`} value={input.quality} onChange={set('quality')} options={(table?.qualities ?? ['ECONOMY', 'STANDARD', 'PRESTIGE']).map((q) => ({ value: q, label: QUALITY_LABEL[q] ?? q }))} aria-label="Quality" />
          </div>
          <div className={labelCls}>
            Province
            <Select className={`${selectCls} mt-0.5 w-full`} value={input.region} onChange={set('region')} options={(table?.regions ?? []).map((r) => ({ value: r.region, label: r.region }))} aria-label="Province" />
          </div>
          <label className={labelCls}>
            Gross floor area (m²)
            <input className={`${inputCls} mt-0.5`} inputMode="numeric" value={input.gfa} onChange={(e) => set('gfa')(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Escalation %
              <input className={`${inputCls} mt-0.5`} inputMode="decimal" value={input.escalationPct} onChange={(e) => set('escalationPct')(e.target.value)} />
            </label>
            <label className={labelCls}>
              Contingency %
              <input className={`${inputCls} mt-0.5`} inputMode="decimal" value={input.contingencyPct} onChange={(e) => set('contingencyPct')(e.target.value)} />
            </label>
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {calc && body.gfa >= 10 && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-3">Element</th>
                    <th className="py-1.5 pr-3 text-right">Share</th>
                    <th className="py-1.5 pr-3 text-right">Per m²</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {calc.elements.map((e) => (
                    <tr key={e.element}>
                      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{e.element}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">{e.pct}%</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(e.perM2, calc.currency)}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(e.amount, calc.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-slate-500">
                    {calc.gfa.toLocaleString('en-ZA')} m² × {money(calc.baseRate, calc.currency)} × {calc.regionFactor}
                  </dt>
                  <dd className="tabular-nums">{money(calc.construction, calc.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Escalation {calc.escalationPct}%</dt>
                  <dd className="tabular-nums">{money(calc.escalation, calc.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Contingency {calc.contingencyPct}%</dt>
                  <dd className="tabular-nums">{money(calc.contingency, calc.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 dark:border-slate-700">
                  <dt className="text-slate-600 dark:text-slate-300">Excluding VAT</dt>
                  <dd className="font-medium tabular-nums">{money(calc.net, calc.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">VAT {Math.round((table?.vat ?? 0.15) * 100)}%</dt>
                  <dd className="tabular-nums">{money(calc.vat, calc.currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 text-base dark:border-slate-700">
                  <dt className="font-semibold text-slate-900 dark:text-slate-100">Total including VAT</dt>
                  <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{money(calc.total, calc.currency)}</dd>
                </div>
                <p className="pt-1 text-xs text-slate-500">{money(calc.ratePerM2All, calc.currency)} per m² all in.</p>
              </dl>
              {scoped && (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <input className={inputCls} value={input.name} onChange={(e) => set('name')(e.target.value)} placeholder="Name (optional)" maxLength={120} aria-label="Estimate name" />
                  <input className={inputCls} value={input.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Assumptions (optional)" maxLength={2000} aria-label="Assumptions" />
                  <button type="button" className={`${primaryBtn} w-full`} onClick={save}>
                    <Save size={14} /> Save this estimate
                  </button>
                  {okMsg && <p className="text-xs text-emerald-700 dark:text-emerald-400">{okMsg}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {scoped && saved && saved.length > 0 && (
        <section className={cardCls} aria-label="Saved rough estimates">
          <h3 className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Saved rough estimates</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {saved.map((s) => (
                <Fragment key={s.id}>
                  <tr className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <td className="w-8 px-3 py-2 text-slate-400">{open === s.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="py-2 pr-3">
                      <span className="block text-slate-800 dark:text-slate-100">{s.name}</span>
                      <span className="block text-xs text-slate-500">
                        {s.region} · {s.createdBy.fullName}, {fmtDay(s.createdAt)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{money(s.total, s.currency)}</td>
                    <td className="w-10 py-2 pr-3 text-right">
                      <button
                        type="button"
                        aria-label={`Delete ${s.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(s);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr>
                      <td />
                      <td colSpan={3} className="pb-3 pr-3 text-xs text-slate-600 dark:text-slate-300">
                        {s.breakdown.gfa.toLocaleString('en-ZA')} m² at {money(s.breakdown.baseRate, s.currency)}/m² × {s.breakdown.regionFactor} ({s.region}); escalation {s.breakdown.escalationPct}%, contingency {s.breakdown.contingencyPct}%. Excl. VAT {money(s.breakdown.net, s.currency)}.
                        {s.notes && <span className="mt-1 block">Assumptions: {s.notes}</span>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
