'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, Download, FileSpreadsheet, Plus, Send, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import type { CostCode } from '@/lib/commercial';
import { CommentThread } from '@/components/project/CommentThread';
import { ITEM_TYPE_LABEL, KIND_LABEL, KIND_STAGE, PLAN_STATUS, download, money, type CostPlan, type CostPlanKind, type CostPlanSummary, type ItemType, type PlanItem } from '@/lib/qs';
import { formatDate } from '@/lib/dates';

const KIND_OPTIONS = (Object.keys(KIND_LABEL) as CostPlanKind[]).map((k) => ({ value: k, label: `${KIND_LABEL[k]} (${KIND_STAGE[k]})` }));
const TYPE_OPTIONS = (Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => ({ value: t, label: ITEM_TYPE_LABEL[t] }));
const cell = 'h-8 w-full rounded border border-transparent bg-transparent px-1.5 text-xs text-slate-800 hover:border-slate-200 focus:border-emerald-500 focus:bg-white focus:outline-none dark:text-slate-100 dark:hover:border-slate-700 dark:focus:bg-slate-900';
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

interface Tender {
  id: string;
  rfqNumber: string;
  title: string;
  status: string;
  awardedQuoteId: string | null;
  ownTotal: number;
  quotes: { id: string; contractor: string; price: number; currency: string; againstQs: number | null; outliers: { description: string; qsRate: number; tenderRate: number; difference: number }[] }[];
}

/** One bill or cost plan: its items, markups, revisions, tenders and notes. */
function BillEditor({ projectId, id, internal, onChanged, onClosed }: { projectId: string; id: string; internal: boolean; onChanged: () => void; onClosed: () => void }) {
  const { authedFetch, accessToken } = useAuth();
  const [plan, setPlan] = useState<CostPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [rates, setRates] = useState({ grossFloorArea: '', prelimsPct: '', contingencyPct: '', escalationPct: '', vatPct: '' });
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [importNote, setImportNote] = useState<string | null>(null);
  const [compareRev, setCompareRev] = useState('');
  const [comparison, setComparison] = useState<{ rows: { section: string; from: number; to: number; change: number }[]; totals: { from: number; to: number; change: number } } | null>(null);
  const [tenders, setTenders] = useState<Tender[] | null>(null);
  const [tenderForm, setTenderForm] = useState({ title: '', dueDate: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/qs/cost-plans/${id}`;

  const show = (p: CostPlan) => {
    setPlan(p);
    setItems(p.items.map((i) => ({ ...i })));
    setDirty(false);
    setRates({ grossFloorArea: p.grossFloorArea?.toString() ?? '', prelimsPct: String(p.prelimsPct), contingencyPct: String(p.contingencyPct), escalationPct: String(p.escalationPct), vatPct: String(p.vatPct) });
  };

  useEffect(() => {
    authedFetch<CostPlan>(base)
      .then(show)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the bill.'));
    authedFetch<CostCode[]>('/cost-codes').then(setCodes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    if (!plan || plan.status === 'DRAFT' || !plan.canEdit) return;
    authedFetch<Tender[]>(`${base}/tenders`).then(setTenders).catch(() => setTenders([]));
  }, [authedFetch, base, plan]);

  async function run<T>(fn: () => Promise<T>, after?: (r: T) => void) {
    setError(null);
    setBusy(true);
    try {
      const r = await fn();
      after?.(r);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const editable = Boolean(plan?.canEdit);
  const setItem = (k: number, patch: Partial<PlanItem>) => {
    setItems((all) =>
      all.map((it, i) => {
        if (i !== k) return it;
        const next = { ...it, ...patch };
        if (next.quantity != null && next.rate != null) next.amount = Math.round(next.quantity * next.rate * 100) / 100;
        return next;
      }),
    );
    setDirty(true);
  };
  const addRow = () => {
    const last = items[items.length - 1];
    setItems([...items, { section: last?.section ?? null, ref: null, description: '', unit: null, quantity: null, rate: null, amount: 0, type: 'MEASURED', costCodeId: last?.costCodeId ?? null }]);
    setDirty(true);
  };

  // Live totals while editing, in the same order as the server.
  const live = useMemo(() => {
    if (!plan) return null;
    const pct = (s: string) => Number(s) || 0;
    const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
    const prelims = (subtotal * pct(rates.prelimsPct)) / 100;
    const contingency = ((subtotal + prelims) * pct(rates.contingencyPct)) / 100;
    const escalation = ((subtotal + prelims + contingency) * pct(rates.escalationPct)) / 100;
    const excl = subtotal + prelims + contingency + escalation;
    const vat = (excl * pct(rates.vatPct)) / 100;
    const gfa = Number(rates.grossFloorArea) || 0;
    return { subtotal, prelims, contingency, escalation, excl, vat, total: excl + vat, perM2: gfa ? excl / gfa : null };
  }, [items, rates, plan]);

  if (error && !plan) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!plan || !live) return <p className="text-sm text-slate-400">Loading…</p>;

  const saveItems = () => run(() => authedFetch<CostPlan>(`${base}/items`, { method: 'PUT', body: { items: items.filter((i) => i.description.trim()) } }), show);
  const saveRates = () =>
    run(
      () =>
        authedFetch<CostPlan>(base, {
          method: 'PATCH',
          body: { grossFloorArea: num(rates.grossFloorArea), prelimsPct: Number(rates.prelimsPct) || 0, contingencyPct: Number(rates.contingencyPct) || 0, escalationPct: Number(rates.escalationPct) || 0, vatPct: Number(rates.vatPct) || 0 },
        }),
      show,
    );
  const importFile = (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    run(
      () => authedFetch<{ plan: CostPlan; imported: number; skipped: string[] }>(`${base}/import`, { method: 'POST', formData: fd }),
      (r) => {
        show(r.plan);
        setImportNote(`${r.imported} items imported from ${file.name}.${r.skipped.length ? ` Skipped: ${r.skipped.slice(0, 3).join('; ')}${r.skipped.length > 3 ? '…' : ''}` : ''}`);
      },
    );
  };
  const compare = (rev: string) => {
    setCompareRev(rev);
    if (!rev) return setComparison(null);
    authedFetch<NonNullable<typeof comparison>>(`${base}/compare?from=${rev}&to=current`)
      .then(setComparison)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Comparison failed.'));
  };
  const createTender = (e: FormEvent) => {
    e.preventDefault();
    run(
      () => authedFetch<{ id: string; rfqNumber: string }>(`${base}/tender`, { method: 'POST', body: { title: tenderForm.title.trim(), dueDate: tenderForm.dueDate || undefined } }),
      () => {
        setTenderForm({ title: '', dueDate: '' });
        authedFetch<Tender[]>(`${base}/tenders`).then(setTenders).catch(() => {});
      },
    );
  };

  const c = plan.currency;
  const st = PLAN_STATUS[plan.status];

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={onClosed} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              ← All bills and cost plans
            </button>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              {plan.number} · {plan.title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{plan.kindLabel}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
              <span>{plan.revision ? `Rev ${plan.revision} issued` : 'Not issued yet'}</span>
              <span>· prepared by {plan.preparedBy.fullName}</span>
              {plan.sourceFileName && <span>· imported from {plan.sourceFileName}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => download(`${base}/export`, accessToken, `${plan.number} ${plan.title}.xlsx`)} className={secondaryButton}>
              <Download size={14} />
              Excel
            </button>
            {plan.canAccept && (
              <button type="button" disabled={busy} onClick={() => run(() => authedFetch<CostPlan>(`${base}/accept`, { method: 'POST' }), show)} className={primaryButton}>
                Accept rev {plan.revision}
              </button>
            )}
            {internal && plan.status === 'ACCEPTED' && plan.kind !== 'TENDER_BOQ' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm('Replace the project budget lines with this bill, by cost code?') && run(() => authedFetch<{ lines: number }>(`${base}/adopt-budget`, { method: 'POST' }), (r) => setImportNote(`The budget now has ${r.lines} lines from ${plan.number}.`))}
                className={secondaryButton}
              >
                Adopt as budget
              </button>
            )}
            {editable && (
              <button type="button" disabled={busy} onClick={() => confirm(`Delete ${plan.number}?`) && run(() => authedFetch(base, { method: 'DELETE' }), onClosed)} className={secondaryButton} aria-label="Delete the bill">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {importNote && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{importNote}</p>}

        {editable && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {(
              [
                ['grossFloorArea', 'Gross floor area (m²)'],
                ['prelimsPct', 'Preliminaries %'],
                ['contingencyPct', 'Contingency %'],
                ['escalationPct', 'Escalation %'],
                ['vatPct', 'VAT %'],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className={labelClass} htmlFor={`rate-${k}`}>
                  {label}
                </label>
                <input id={`rate-${k}`} type="number" min={0} step="any" className={`${inputClass} text-right`} value={rates[k]} onChange={(e) => setRates({ ...rates, [k]: e.target.value })} />
              </div>
            ))}
            <div className="flex items-end">
              <button type="button" disabled={busy} onClick={saveRates} className={secondaryButton}>
                Save rates
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Items</h3>
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Import mode" className={`${inputClass} h-9 w-36`} value={mode} onChange={(v) => setMode(v as 'replace' | 'append')} options={[{ value: 'replace', label: 'Replace items' }, { value: 'append', label: 'Add to items' }]} />
              <label className={`${secondaryButton} cursor-pointer`}>
                <Upload size={14} />
                Import Excel or CSV
                <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              </label>
              <button type="button" onClick={addRow} className={secondaryButton}>
                <Plus size={14} />
                Row
              </button>
              <button type="button" disabled={!dirty || busy} onClick={saveItems} className={primaryButton}>
                {dirty ? 'Save items' : 'Saved'}
              </button>
            </div>
          )}
        </div>
        {editable && plan.status !== 'DRAFT' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Changing an issued bill takes it back to a draft. Rev {plan.revision} stays in the history.</p>}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="w-16 px-1.5 py-2">Item</th>
                <th className="px-1.5 py-2">Description</th>
                <th className="w-16 px-1.5 py-2">Unit</th>
                <th className="w-24 px-1.5 py-2 text-right">Qty</th>
                <th className="w-28 px-1.5 py-2 text-right">Rate</th>
                <th className="w-32 px-1.5 py-2 text-right">Amount</th>
                <th className="w-32 px-1.5 py-2">Type</th>
                <th className="w-36 px-1.5 py-2">Cost code</th>
                {editable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-1.5 py-6 text-center text-slate-400">
                    No items yet. Import the bill from Excel, or add rows.
                  </td>
                </tr>
              )}
              {items.map((it, k) => {
                const heading = k === 0 || it.section !== items[k - 1].section;
                return [
                  heading ? (
                    <tr key={`h-${k}`} className="bg-slate-50 dark:bg-slate-800/40">
                      <td colSpan={editable ? 9 : 8} className="px-1.5 py-1">
                        {editable ? (
                          <input aria-label="Bill or element" className={`${cell} font-semibold`} placeholder="Bill or element, e.g. Bill 3: Concrete" value={it.section ?? ''} onChange={(e) => setItem(k, { section: e.target.value || null })} />
                        ) : (
                          <span className="px-1.5 font-semibold text-slate-700 dark:text-slate-200">{it.section || 'General'}</span>
                        )}
                      </td>
                    </tr>
                  ) : null,
                  <tr key={it.id ?? `n-${k}`} className="border-b border-slate-100 dark:border-slate-800">
                    {editable ? (
                      <>
                        <td>
                          <input aria-label="Item" className={cell} value={it.ref ?? ''} onChange={(e) => setItem(k, { ref: e.target.value || null })} />
                        </td>
                        <td>
                          <input aria-label="Description" className={cell} value={it.description} onChange={(e) => setItem(k, { description: e.target.value })} />
                        </td>
                        <td>
                          <input aria-label="Unit" className={cell} value={it.unit ?? ''} onChange={(e) => setItem(k, { unit: e.target.value || null })} />
                        </td>
                        <td>
                          <input aria-label="Quantity" inputMode="decimal" className={`${cell} text-right tabular-nums`} value={it.quantity ?? ''} onChange={(e) => setItem(k, { quantity: num(e.target.value) })} />
                        </td>
                        <td>
                          <input aria-label="Rate" inputMode="decimal" className={`${cell} text-right tabular-nums`} value={it.rate ?? ''} onChange={(e) => setItem(k, { rate: num(e.target.value) })} />
                        </td>
                        <td>
                          <input
                            aria-label="Amount"
                            inputMode="decimal"
                            readOnly={it.quantity != null && it.rate != null}
                            title={it.quantity != null && it.rate != null ? 'Quantity × rate' : 'A lump sum'}
                            className={`${cell} text-right tabular-nums`}
                            value={it.amount}
                            onChange={(e) => setItem(k, { amount: num(e.target.value) ?? 0 })}
                          />
                        </td>
                        <td>
                          <Select aria-label="Type" className={`${cell} h-8`} value={it.type} onChange={(v) => setItem(k, { type: v as ItemType })} options={TYPE_OPTIONS} />
                        </td>
                        <td>
                          <Select aria-label="Cost code" className={`${cell} h-8`} value={it.costCodeId ?? ''} onChange={(v) => setItem(k, { costCodeId: v || null })} options={[{ value: '', label: '—' }, ...codes.map((cc) => ({ value: cc.id, label: `${cc.code} ${cc.name}` }))]} />
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-label="Remove the row"
                            onClick={() => {
                              setItems(items.filter((_, i) => i !== k));
                              setDirty(true);
                            }}
                            className="rounded p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-1.5 py-1.5 text-slate-500">{it.ref}</td>
                        <td className="px-1.5 py-1.5 text-slate-800 dark:text-slate-100">{it.description}</td>
                        <td className="px-1.5 py-1.5">{it.unit}</td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">{it.quantity ?? ''}</td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">{it.rate != null ? money(it.rate) : ''}</td>
                        <td className="px-1.5 py-1.5 text-right tabular-nums">{money(it.amount)}</td>
                        <td className="px-1.5 py-1.5">{ITEM_TYPE_LABEL[it.type]}</td>
                        <td className="px-1.5 py-1.5">{codes.find((cc) => cc.id === it.costCodeId)?.code ?? '—'}</td>
                      </>
                    )}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 ml-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {plan.totals.sections.length > 1 &&
            plan.totals.sections.map((s) => (
              <div key={s.section} className="contents text-slate-500">
                <dt className="truncate">{s.section}</dt>
                <dd className="text-right tabular-nums">{money(s.total)}</dd>
              </div>
            ))}
          <dt className="font-medium text-slate-700 dark:text-slate-200">Subtotal</dt>
          <dd className="text-right font-medium tabular-nums">{money(live.subtotal, c)}</dd>
          {live.prelims > 0 && (
            <>
              <dt>Preliminaries ({rates.prelimsPct}%)</dt>
              <dd className="text-right tabular-nums">{money(live.prelims)}</dd>
            </>
          )}
          {live.contingency > 0 && (
            <>
              <dt>Contingency ({rates.contingencyPct}%)</dt>
              <dd className="text-right tabular-nums">{money(live.contingency)}</dd>
            </>
          )}
          {live.escalation > 0 && (
            <>
              <dt>Escalation ({rates.escalationPct}%)</dt>
              <dd className="text-right tabular-nums">{money(live.escalation)}</dd>
            </>
          )}
          <dt className="font-medium text-slate-700 dark:text-slate-200">Total excluding VAT</dt>
          <dd className="text-right font-medium tabular-nums">{money(live.excl, c)}</dd>
          <dt>VAT ({rates.vatPct}%)</dt>
          <dd className="text-right tabular-nums">{money(live.vat)}</dd>
          <dt className="font-semibold text-slate-900 dark:text-slate-100">Total</dt>
          <dd className="text-right font-semibold tabular-nums">{money(live.total, c)}</dd>
          {live.perM2 != null && (
            <>
              <dt>Per m² (excl. VAT)</dt>
              <dd className="text-right tabular-nums">{money(live.perM2)}</dd>
            </>
          )}
          {(plan.totals.provisional > 0 || plan.totals.primeCost > 0) && (
            <p className="col-span-2 mt-1 text-[11px] text-slate-500">
              Includes{' '}
              {[plan.totals.provisional > 0 && `provisional sums ${money(plan.totals.provisional)}`, plan.totals.primeCost > 0 && `prime cost sums ${money(plan.totals.primeCost)}`].filter(Boolean).join(' and ')}.
            </p>
          )}
        </dl>
      </div>

      {editable && plan.status === 'DRAFT' && (
        <div className={`${cardClass} flex flex-wrap items-end gap-2`}>
          <div className="min-w-0 flex-1">
            <label className={labelClass} htmlFor="issue-reason">
              Issue rev {plan.revision + 1}: what changed
            </label>
            <input id="issue-reason" className={inputClass} placeholder={plan.revision ? 'e.g. Updated for design development drawings rev C' : 'e.g. First issue for comment'} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button type="button" disabled={busy || dirty || !items.length} onClick={() => run(() => authedFetch<CostPlan>(`${base}/issue`, { method: 'POST', body: { reason: reason.trim() || undefined } }), (p) => {
            show(p);
            setReason('');
          })} className={primaryButton}>
            <Send size={14} />
            Issue to Setjeka
          </button>
          {dirty && <p className="w-full text-xs text-slate-500">Save the items first.</p>}
        </div>
      )}

      {plan.revisions.length > 0 && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Revisions</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {plan.revisions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="font-mono">Rev {r.revision}</span>
                <span className="flex-1 text-slate-500">
                  {formatDate(r.issuedAt)} · {r.issuedBy.fullName} · {r.itemCount} items{r.reason ? ` · ${r.reason}` : ''}
                </span>
                <span className="tabular-nums">{money(r.total, c)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-56">
              <label className={labelClass} htmlFor="compare">
                Compare the bill now with
              </label>
              <Select id="compare" className={inputClass} value={compareRev} onChange={compare} options={[{ value: '', label: '—' }, ...plan.revisions.map((r) => ({ value: String(r.revision), label: `Rev ${r.revision}` }))]} />
            </div>
          </div>
          {comparison && (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  <th className="py-1">Bill or element</th>
                  <th className="py-1 text-right">Rev {compareRev}</th>
                  <th className="py-1 text-right">Now</th>
                  <th className="py-1 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {[...comparison.rows, { section: 'Total excluding VAT', ...comparison.totals }].map((r) => (
                  <tr key={r.section} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1">{r.section}</td>
                    <td className="py-1 text-right tabular-nums">{money(r.from)}</td>
                    <td className="py-1 text-right tabular-nums">{money(r.to)}</td>
                    <td className={`py-1 text-right tabular-nums ${r.change > 0 ? 'text-red-700 dark:text-red-400' : r.change < 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                      {r.change > 0 ? '+' : ''}
                      {money(r.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editable && plan.status !== 'DRAFT' && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tenders on this bill</h3>
          <p className="mt-1 text-xs text-slate-500">Go to tender on the bill: tenderers price each item in the supplier portal, and their prices are compared with yours here (QS 4.5, 4.6). Setjeka invites the tenderers, issues the request and awards it under Procurement.</p>
          <form onSubmit={createTender} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className={labelClass} htmlFor="tender-title">
                Tender title
              </label>
              <input id="tender-title" className={inputClass} placeholder="e.g. Main contract works" value={tenderForm.title} onChange={(e) => setTenderForm({ ...tenderForm, title: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="tender-due">
                Tenders close
              </label>
              <input id="tender-due" type="date" className={inputClass} value={tenderForm.dueDate} onChange={(e) => setTenderForm({ ...tenderForm, dueDate: e.target.value })} />
            </div>
            <button type="submit" disabled={busy || !tenderForm.title.trim()} className={secondaryButton}>
              <FileSpreadsheet size={14} />
              Create tender
            </button>
          </form>
          {tenders && tenders.length > 0 && (
            <ul className="mt-4 space-y-3">
              {tenders.map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    <Link href={`/projects/${projectId}?tab=procurement`} className="hover:underline">
                      {t.rfqNumber}
                    </Link>{' '}
                    {t.title} <span className="text-xs font-normal text-slate-500">· {t.status.toLowerCase()} · your total {money(t.ownTotal, c)}</span>
                  </p>
                  {t.quotes.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-400">No prices in yet.</p>
                  ) : (
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {t.quotes.map((q) => (
                          <tr key={q.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                            <td className="py-1.5 pr-2 font-medium">
                              {q.contractor}
                              {t.awardedQuoteId === q.id && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">awarded</span>}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{money(q.price, q.currency)}</td>
                            <td className={`py-1.5 pr-2 text-right tabular-nums ${q.againstQs != null && q.againstQs > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                              {q.againstQs != null ? `${q.againstQs > 0 ? '+' : ''}${q.againstQs}% on yours` : ''}
                            </td>
                            <td className="py-1.5 text-slate-500">{q.outliers.length > 0 && `Furthest from your rates: ${q.outliers.slice(0, 3).map((o) => `${o.description.slice(0, 40)} (${o.difference > 0 ? '+' : ''}${o.difference}%)`).join('; ')}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={cardClass}>
        <CommentThread projectId={projectId} entityType="COST_PLAN" entityId={plan.id} />
      </div>
    </div>
  );
}

/** Register COM "BOQ management" and PROCSA QS 2.5, 3.5, 4.3, 4.4: the
 * QS's estimates and bills, from the preliminary estimate to the bill for
 * tender. Setjeka accepts an issued bill and can adopt it as the budget. */
export function BillsPanel({ projectId, internal, isClient, initialPlanId, onChanged }: { projectId: string; internal: boolean; isClient: boolean; initialPlanId?: string | null; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<CostPlanSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(initialPlanId ?? null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'ELEMENTAL' as CostPlanKind, copyFromId: '', grossFloorArea: '' });
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const canEdit = !isClient;

  useEffect(() => {
    authedFetch<CostPlanSummary[]>(`/projects/${projectId}/qs/cost-plans`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the bills.'));
  }, [authedFetch, projectId, version]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await authedFetch<CostPlan>(`/projects/${projectId}/qs/cost-plans`, {
        method: 'POST',
        body: { title: form.title.trim(), kind: form.kind, copyFromId: form.copyFromId || undefined, grossFloorArea: num(form.grossFloorArea) ?? undefined },
      });
      setCreating(false);
      setForm({ title: '', kind: 'ELEMENTAL', copyFromId: '', grossFloorArea: '' });
      setOpen(p.id);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the bill.');
    }
  }

  if (open)
    return (
      <BillEditor
        projectId={projectId}
        id={open}
        internal={internal}
        onChanged={() => {
          setVersion((v) => v + 1);
          onChanged();
        }}
        onClosed={() => setOpen(null)}
      />
    );

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bills of quantities and cost plans</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              {isClient
                ? 'The cost plans Setjeka has accepted from the quantity surveyor.'
                : 'The QS’s estimates and bills, stage by stage: preliminary and elemental (Stage 2), detailed (Stage 3), pre-tender and the bill for tender (Stage 4). Import from Excel or work here; issuing a revision sends it to Setjeka to accept.'}
            </p>
          </div>
          {canEdit && !creating && (
            <button type="button" onClick={() => setCreating(true)} className={secondaryButton}>
              <Plus size={14} />
              New bill or estimate
            </button>
          )}
        </div>
        {creating && (
          <form onSubmit={create} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="bq-title">
                Title
              </label>
              <input id="bq-title" className={inputClass} placeholder="e.g. Elemental estimate, scheme B" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="bq-kind">
                Kind
              </label>
              <Select id="bq-kind" className={inputClass} value={form.kind} onChange={(v) => setForm({ ...form, kind: v as CostPlanKind })} options={KIND_OPTIONS} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="bq-copy">
                Start from
              </label>
              <Select id="bq-copy" className={inputClass} value={form.copyFromId} onChange={(v) => setForm({ ...form, copyFromId: v })} options={[{ value: '', label: 'An empty bill' }, ...(rows ?? []).map((r) => ({ value: r.id, label: `${r.number} ${r.title}` }))]} />
            </div>
            <div>
              <label className={labelClass} htmlFor="bq-gfa">
                Gross floor area (m²)
              </label>
              <input id="bq-gfa" type="number" min={0} step="any" className={`${inputClass} text-right`} value={form.grossFloorArea} onChange={(e) => setForm({ ...form, grossFloorArea: e.target.value })} />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={!form.title.trim()} className={primaryButton}>
                Create
              </button>
              <button type="button" onClick={() => setCreating(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className={`${cardClass} text-sm text-slate-400`}>No bills or estimates yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r.id)} className={`${cardClass} flex w-full flex-wrap items-center gap-2 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <ChevronDown size={14} className="-rotate-90 text-slate-400" />
                <span className="font-mono text-xs text-slate-500">{r.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                  <span className="block text-xs text-slate-500">
                    {r.kindLabel} · {r.itemCount} items · {r.revision ? `rev ${r.revision}` : 'not issued'}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-slate-800 dark:text-slate-100">{money(r.totals.totalExclVat, r.currency)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PLAN_STATUS[r.status].tone}`}>{PLAN_STATUS[r.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
