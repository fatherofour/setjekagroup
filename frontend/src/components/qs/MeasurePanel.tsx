'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Ruler } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { money } from '@/lib/qs';
import { cardCls, fmtDay, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls, todayIso } from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

type MeasureStatus = 'RECORDED' | 'AGREED' | 'DISPUTED';
type DayworkStatus = 'SUBMITTED' | 'SIGNED' | 'REJECTED';

interface SiteContract {
  id: string;
  title: string;
  contractor: { id: string; name: string };
  measured: boolean;
  currency: string;
  canMeasure: boolean;
  isContractor: boolean;
}

interface BillItem {
  id: string;
  ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  measured: number;
  agreed: number;
  overBill: boolean;
}

interface Measurement {
  id: string;
  date: string;
  location: string | null;
  quantity: number;
  notes: string | null;
  status: MeasureStatus;
  disputeReason: string | null;
  recordedBy: { fullName: string };
  respondedBy: { fullName: string } | null;
  costPlanItem: { id: string; ref: string | null; description: string; unit: string | null };
}

interface DayworkSheet {
  id: string;
  number: string;
  date: string;
  description: string;
  labour: number;
  plant: number;
  materials: number;
  total: number;
  status: DayworkStatus;
  decisionNote: string | null;
  submittedBy: { fullName: string };
  decidedBy: { fullName: string } | null;
}

interface Measures {
  contract: { id: string; title: string; measured: boolean; currency: string };
  can: { measure: boolean; respond: boolean };
  items: BillItem[];
  measurements: Measurement[];
}

interface Dayworks {
  can: { submit: boolean; sign: boolean };
  signedTotal: number;
  sheets: DayworkSheet[];
}

const MEASURE_STATUS: Record<MeasureStatus, { label: string; tone: string }> = {
  RECORDED: { label: 'Awaiting the contractor', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  AGREED: { label: 'Agreed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  DISPUTED: { label: 'Disputed', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
};
const DAYWORK_STATUS: Record<DayworkStatus, { label: string; tone: string }> = {
  SUBMITTED: { label: 'Waiting to be signed', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SIGNED: { label: 'Signed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  REJECTED: { label: 'Rejected', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
};
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const qty = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-GB', { maximumFractionDigits: 3 }));

function DayworkRow({ projectId, base, d, currency, canSign, onChanged }: { projectId: string; base: string; d: DayworkSheet; currency: string; canSign: boolean; onChanged: (x: Dayworks) => void }) {
  const { authedFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(sign: boolean) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await authedFetch<Dayworks>(`${base}/dayworks/${d.id}/${sign ? 'sign' : 'reject'}`, { method: 'POST', body: { reason: note.trim() || undefined } }));
      setNote('');
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`${cardCls} p-3`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <span className="font-mono text-xs text-slate-500">{d.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{d.description}</span>
          <span className="block text-xs text-slate-500">
            {fmtDay(d.date)} · labour {money(d.labour)} · plant {money(d.plant)} · materials {money(d.materials)} · from {d.submittedBy.fullName}
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{money(d.total, currency)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${DAYWORK_STATUS[d.status].tone}`}>{DAYWORK_STATUS[d.status].label}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          {d.decidedBy && (
            <p className="text-xs text-slate-500">
              {d.status === 'SIGNED' ? 'Signed' : 'Rejected'} by {d.decidedBy.fullName}
              {d.decisionNote && `: ${d.decisionNote}`}
            </p>
          )}
          {d.status === 'SUBMITTED' && canSign && (
            <div className="space-y-2">
              <textarea className={textareaCls} rows={2} aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note (needed to reject)" />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => decide(true)} className={primaryBtn}>
                  Sign
                </button>
                <button type="button" disabled={busy || !note.trim()} onClick={() => decide(false)} className={secondaryBtn}>
                  Reject
                </button>
              </div>
            </div>
          )}
          <CommentThread projectId={projectId} entityType="DAYWORK" entityId={d.id} />
        </div>
      )}
    </li>
  );
}

export function MeasurePanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [contracts, setContracts] = useState<SiteContract[] | null>(null);
  const [contractId, setContractId] = useState(params.get('contract') ?? '');
  const [m, setM] = useState<Measures | null>(null);
  const [dw, setDw] = useState<Dayworks | null>(null);
  const [recording, setRecording] = useState(false);
  const [form, setForm] = useState({ costPlanItemId: '', date: todayIso(), quantity: '', location: '', notes: '' });
  const [sheeting, setSheeting] = useState(false);
  const [sheet, setSheet] = useState({ date: todayIso(), description: '', labour: '', plant: '', materials: '' });
  const [disputing, setDisputing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/qs/contracts/${contractId}`;
  const contract = contracts?.find((c) => c.id === contractId);

  useEffect(() => {
    authedFetch<SiteContract[]>(`/projects/${projectId}/qs/site-contracts`)
      .then((rows) => {
        setContracts(rows);
        setContractId((cur) => (rows.some((c) => c.id === cur) ? cur : (rows.find((c) => c.measured) ?? rows[0])?.id ?? ''));
      })
      .catch((e) => setError(err(e, 'Failed to load the contracts.')));
  }, [authedFetch, projectId]);

  useEffect(() => {
    if (!contractId) return;
    Promise.all([authedFetch<Measures>(`/projects/${projectId}/qs/contracts/${contractId}/measurements`), authedFetch<Dayworks>(`/projects/${projectId}/qs/contracts/${contractId}/dayworks`)])
      .then(([a, b]) => {
        setM(a);
        setDw(b);
      })
      .catch((e) => setError(err(e, 'Failed to load the measurements.')));
  }, [authedFetch, projectId, contractId]);

  async function run<T>(fn: () => Promise<T>, then: (x: T) => void) {
    setError(null);
    setBusy(true);
    try {
      then(await fn());
      return true;
    } catch (e) {
      setError(err(e, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function record(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => authedFetch<Measures>(`${base}/measurements`, { method: 'POST', body: { costPlanItemId: form.costPlanItemId, date: form.date, quantity: Number(form.quantity), location: form.location.trim() || undefined, notes: form.notes.trim() || undefined } }),
      setM,
    );
    if (ok) setForm({ ...form, quantity: '', location: '', notes: '' });
  }

  async function submitSheet(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => authedFetch<Dayworks>(`${base}/dayworks`, { method: 'POST', body: { date: sheet.date, description: sheet.description.trim(), labour: Number(sheet.labour) || 0, plant: Number(sheet.plant) || 0, materials: Number(sheet.materials) || 0 } }),
      setDw,
    );
    if (ok) {
      setSheet({ date: todayIso(), description: '', labour: '', plant: '', materials: '' });
      setSheeting(false);
    }
  }

  if (contracts === null) return error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : <p className="text-sm text-slate-400">Loading…</p>;
  if (!contracts.length) return <p className={`${cardCls} p-4 text-sm text-slate-400`}>No contracts you measure or work under on this project.</p>;

  const cur = contract?.currency ?? '';
  const sheetTotal = (Number(sheet.labour) || 0) + (Number(sheet.plant) || 0) + (Number(sheet.materials) || 0);

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Ruler size={16} className="text-emerald-600" /> Site measurement and dayworks
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {contract?.isContractor
                ? 'Agree or dispute the quantities measured on site; agreed quantities are what you are paid for on a measured contract. Submit daywork sheets for work done on dayworks.'
                : 'On a measured contract, record the quantities measured on site against the bill; the contractor agrees them and the next valuation pays the agreed quantity at the bill rate. Sign daywork sheets to have them paid in the next valuation.'}
            </p>
          </div>
          <Select aria-label="Contract" className={`${selectCls} h-9 w-72`} value={contractId} onChange={setContractId} options={contracts.map((c) => ({ value: c.id, label: `${c.title} · ${c.contractor.name}${c.measured ? ' · measured' : ''}` }))} />
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      </div>

      {m && (
        <div className={`${cardCls} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Measurements</h3>
            {m.contract.measured && m.can.measure && !recording && (
              <button type="button" onClick={() => setRecording(true)} className={secondaryBtn}>
                <Plus size={14} /> Record a measurement
              </button>
            )}
          </div>
          {!m.contract.measured ? (
            <p className="mt-2 text-xs text-slate-500">This contract is paid on % complete, not remeasured. The QS can make it a measured contract until the first valuation is certified.</p>
          ) : (
            <>
              {recording && (
                <form onSubmit={record} className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
                  <div className={`${labelCls} sm:col-span-2`}>
                    Bill item
                    <Select className={`${selectCls} mt-0.5 w-full`} aria-label="Bill item" value={form.costPlanItemId} onChange={(v) => setForm({ ...form, costPlanItemId: v })} options={[{ value: '', label: 'Choose…' }, ...m.items.map((i) => ({ value: i.id, label: `${i.ref ? `${i.ref} ` : ''}${i.description.slice(0, 70)}${i.unit ? ` (${i.unit})` : ''}` }))]} />
                  </div>
                  <label className={labelCls}>
                    Measured on
                    <DateInput className={`${inputCls} mt-0.5 w-full`} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </label>
                  <label className={labelCls}>
                    Quantity
                    <input type="number" min={0} step="any" className={`${inputCls} mt-0.5 w-full text-right`} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </label>
                  <label className={`${labelCls} sm:col-span-2`}>
                    Where
                    <input className={`${inputCls} mt-0.5 w-full`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Block B, grid 3-5" />
                  </label>
                  <label className={`${labelCls} sm:col-span-2`}>
                    Notes
                    <input className={`${inputCls} mt-0.5 w-full`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </label>
                  <div className="flex gap-2 sm:col-span-4">
                    <button type="submit" disabled={busy || !form.costPlanItemId || form.quantity === '' || Number(form.quantity) < 0} className={primaryBtn}>
                      Record
                    </button>
                    <button type="button" onClick={() => setRecording(false)} className={secondaryBtn}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-2">Bill item</th>
                      <th className="hidden w-16 py-2 pr-2 sm:table-cell">Unit</th>
                      <th className="w-14 py-2 pr-2 text-right sm:w-24">Bill qty</th>
                      <th className="w-16 py-2 pr-2 text-right sm:w-24">Measured</th>
                      <th className="w-14 py-2 text-right sm:w-24">Agreed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.items.map((i) => (
                      <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-100">
                          {i.ref && <span className="mr-1 font-mono text-slate-500">{i.ref}</span>}
                          {i.description}
                          {i.unit && <span className="text-slate-400 sm:hidden"> ({i.unit})</span>}
                        </td>
                        <td className="hidden py-1.5 pr-2 text-slate-500 sm:table-cell">{i.unit ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{qty(i.quantity)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{qty(i.measured)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${i.overBill ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}`} title={i.overBill ? 'Over the bill quantity' : undefined}>
                          {qty(i.agreed)}
                          {i.overBill && ' ▲'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {m.measurements.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {m.measurements.map((x) => (
                    <li key={x.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
                          <span className="font-semibold tabular-nums">
                            {qty(x.quantity)} {x.costPlanItem.unit ?? ''}
                          </span>{' '}
                          of {x.costPlanItem.ref && `${x.costPlanItem.ref} `}
                          {x.costPlanItem.description}
                          <span className="block text-xs text-slate-500">
                            {fmtDay(x.date)}
                            {x.location && ` · ${x.location}`} · measured by {x.recordedBy.fullName}
                            {x.respondedBy && ` · ${x.status === 'AGREED' ? 'agreed' : 'disputed'} by ${x.respondedBy.fullName}`}
                            {x.notes && ` · ${x.notes}`}
                          </span>
                          {x.disputeReason && <span className="block text-xs text-red-700 dark:text-red-400">Disputed: {x.disputeReason}</span>}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${MEASURE_STATUS[x.status].tone}`}>{MEASURE_STATUS[x.status].label}</span>
                        {x.status === 'RECORDED' && contract?.isContractor && (
                          <>
                            <button type="button" disabled={busy} onClick={() => run(() => authedFetch<Measures>(`${base}/measurements/${x.id}/agree`, { method: 'POST' }), setM)} className={primaryBtn}>
                              Agree
                            </button>
                            <button type="button" disabled={busy} onClick={() => setDisputing(disputing === x.id ? null : x.id)} className={secondaryBtn}>
                              Dispute
                            </button>
                          </>
                        )}
                        {x.status !== 'AGREED' && m.can.measure && (
                          <button type="button" disabled={busy} onClick={() => run(() => authedFetch<Measures>(`${base}/measurements/${x.id}`, { method: 'DELETE' }), setM)} className={secondaryBtn}>
                            Remove
                          </button>
                        )}
                      </div>
                      {disputing === x.id && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input aria-label="Why it is disputed" className={`${inputCls} min-w-0 flex-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the quantity is wrong" />
                          <button
                            type="button"
                            disabled={busy || !reason.trim()}
                            onClick={async () => {
                              if (await run(() => authedFetch<Measures>(`${base}/measurements/${x.id}/dispute`, { method: 'POST', body: { reason: reason.trim() } }), setM)) {
                                setDisputing(null);
                                setReason('');
                              }
                            }}
                            className={primaryBtn}
                          >
                            Send dispute
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {dw && (
        <div className={`${cardCls} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daywork sheets
              {dw.signedTotal > 0 && <span className="ml-2 text-xs font-normal text-slate-500">signed to date {money(dw.signedTotal, cur)}</span>}
            </h3>
            {dw.can.submit && !sheeting && (
              <button type="button" onClick={() => setSheeting(true)} className={secondaryBtn}>
                <Plus size={14} /> Submit a daywork sheet
              </button>
            )}
          </div>
          {sheeting && (
            <form onSubmit={submitSheet} className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
              <label className={`${labelCls} sm:col-span-3`}>
                Work done
                <input className={`${inputCls} mt-0.5 w-full`} value={sheet.description} onChange={(e) => setSheet({ ...sheet, description: e.target.value })} placeholder="e.g. Breaking out unforeseen rock, trench 4" />
              </label>
              <label className={labelCls}>
                Date
                <DateInput className={`${inputCls} mt-0.5 w-full`} value={sheet.date} onChange={(e) => setSheet({ ...sheet, date: e.target.value })} />
              </label>
              {(['labour', 'plant', 'materials'] as const).map((k) => (
                <label key={k} className={labelCls}>
                  {k[0].toUpperCase() + k.slice(1)} ({cur})
                  <input type="number" min={0} step="any" className={`${inputCls} mt-0.5 w-full text-right`} value={sheet[k]} onChange={(e) => setSheet({ ...sheet, [k]: e.target.value })} />
                </label>
              ))}
              <p className="self-end pb-2 text-right text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{money(sheetTotal, cur)}</p>
              <div className="flex gap-2 sm:col-span-4">
                <button type="submit" disabled={busy || !sheet.description.trim() || sheetTotal <= 0} className={primaryBtn}>
                  Submit
                </button>
                <button type="button" onClick={() => setSheeting(false)} className={secondaryBtn}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {dw.sheets.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No daywork sheets on this contract.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dw.sheets.map((d) => (
                <DayworkRow key={d.id} projectId={projectId} base={base} d={d} currency={cur} canSign={dw.can.sign} onChanged={setDw} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
