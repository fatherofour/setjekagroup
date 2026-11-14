'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Tractor } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, todayIso } from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

type Category = 'EARTHMOVING' | 'LIFTING' | 'ACCESS' | 'CONCRETE' | 'COMPACTION' | 'TRANSPORT' | 'POWER' | 'SMALL_PLANT' | 'OTHER';
type Status = 'WORKING' | 'STANDING' | 'BROKEN_DOWN' | 'OFF_SITE';

interface Plant {
  id: string;
  number: string;
  description: string;
  category: Category;
  fleetNumber: string | null;
  ownership: 'OWNED' | 'HIRED';
  supplier: string | null;
  operator: string | null;
  operatorCertExpiry: string | null;
  arrivedOn: string;
  offHireDue: string | null;
  departedOn: string | null;
  status: Status;
  outOfUse: boolean;
  inspectionIntervalDays: number | null;
  lastInspectedOn: string | null;
  nextInspectionDue: string | null;
  certificateExpiry: string | null;
  contractor: { id: string; name: string } | null;
  addedBy: { fullName: string };
  history: { kind: string; at: string; name: string; note?: string | null; to?: string; passed?: boolean; date?: string; next?: string | null; inspector?: string | null; operator?: string | null }[];
  onSite: boolean;
  daysOnSite: number;
  flags: string[];
  needsCertificate: boolean;
  can: { edit: boolean; status: boolean; inspect: boolean; offSite: boolean };
}

interface Listing {
  today: string;
  firms: { id: string; name: string }[];
  plant: Plant[];
  board: { onSite: number; working: number; standing: number; brokenDown: number; inspectionsDue: number; certificates: number; pastOffHire: number };
  can: { add: boolean; anyFirm: boolean };
}

const CATEGORY: Record<Category, string> = {
  EARTHMOVING: 'Earthmoving',
  LIFTING: 'Lifting (cranes, hoists)',
  ACCESS: 'Access (MEWPs, scaffold towers)',
  CONCRETE: 'Concrete',
  COMPACTION: 'Compaction',
  TRANSPORT: 'Transport',
  POWER: 'Power (generators, compressors)',
  SMALL_PLANT: 'Small plant and tools',
  OTHER: 'Other',
};
const STATUS: Record<Status, { label: string; tone: string }> = {
  WORKING: { label: 'Working', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  STANDING: { label: 'Standing', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  BROKEN_DOWN: { label: 'Broken down', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  OFF_SITE: { label: 'Off site', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};
const FLAG: Record<string, { label: string; late: boolean }> = {
  INSPECTION_OVERDUE: { label: 'Inspection overdue', late: true },
  INSPECTION_DUE: { label: 'Inspection due this week', late: false },
  CERTIFICATE_EXPIRED: { label: 'Certificate expired', late: true },
  CERTIFICATE_DUE: { label: 'Certificate expires within 30 days', late: false },
  NO_CERTIFICATE: { label: 'No certificate recorded', late: true },
  OPERATOR_CERT_EXPIRED: { label: 'Operator’s certificate expired', late: true },
  OPERATOR_CERT_DUE: { label: 'Operator’s certificate expires within 30 days', late: false },
  PAST_OFF_HIRE: { label: 'Past its off-hire date', late: false },
  OUT_OF_USE: { label: 'Out of use: failed inspection', late: true },
};

const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const chip = 'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium';

function Flags({ p }: { p: Plant }) {
  if (!p.flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {p.flags.map((f) => (
        <span key={f} className={`${chip} ${FLAG[f]?.late ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
          {FLAG[f]?.label ?? f}
        </span>
      ))}
    </span>
  );
}

function historyLine(h: Plant['history'][number]) {
  switch (h.kind) {
    case 'ARRIVED':
      return `Arrived on site ${fmtDay(h.date)}`;
    case 'STATUS':
      return `${STATUS[h.to as Status]?.label ?? h.to}${h.note ? ` — ${h.note}` : ''}`;
    case 'INSPECTED':
      return `Inspected ${fmtDay(h.date)}${h.inspector ? ` by ${h.inspector}` : ''}: ${h.passed ? 'passed' : 'FAILED'}${h.next ? `, next due ${fmtDay(h.next)}` : ''}${h.note ? ` — ${h.note}` : ''}`;
    case 'OPERATOR':
      return `Operator now ${h.operator ?? 'not named'}`;
    case 'OFF_SITE':
      return `Left site ${fmtDay(h.date)}${h.note ? ` — ${h.note}` : ''}`;
    default:
      return h.kind;
  }
}

function Detail({ projectId, id, onBack, onChanged }: { projectId: string; id: string; onBack: () => void; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [p, setP] = useState<Plant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [insp, setInsp] = useState({ date: todayIso(), passed: true, inspector: '', nextDue: '', certificateExpiry: '', note: '' });
  const [leave, setLeave] = useState(todayIso());
  const [operator, setOperator] = useState<{ operator: string; operatorCertExpiry: string; offHireDue: string } | null>(null);

  const load = useCallback(() => {
    authedFetch<Plant>(`/projects/${projectId}/plant/${id}`)
      .then(setP)
      .catch((e) => setError(err(e, 'Failed to load the plant.')));
  }, [authedFetch, projectId, id]);
  useEffect(load, [load]);

  async function call(path: string, body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') {
    setBusy(true);
    setError(null);
    try {
      setP(await authedFetch<Plant>(`/projects/${projectId}/plant/${id}${path}`, { method, body }));
      setNote('');
      onChanged();
      return true;
    } catch (e) {
      setError(err(e, 'That did not go through.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!p) return error ? <p className={errBox}>{error}</p> : <p className="text-sm text-slate-400">Loading…</p>;
  const st = STATUS[p.status];

  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> All plant
      </button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {p.number} {p.description}
          </h2>
          <p className="text-xs text-slate-500">
            {CATEGORY[p.category]}
            {p.fleetNumber && ` · ${p.fleetNumber}`}
            {p.contractor && ` · ${p.contractor.name}`}
          </p>
        </div>
        <span className={`${chip} ${st.tone}`}>{st.label}</span>
      </div>
      <div className="mt-2">
        <Flags p={p} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {[
          [p.ownership === 'HIRED' ? 'Hired from' : 'Owned by', p.supplier ?? '—'],
          ['On site', `${fmtDay(p.arrivedOn)}${p.departedOn ? ` – ${fmtDay(p.departedOn)}` : ''} (${p.daysOnSite} ${p.daysOnSite === 1 ? 'day' : 'days'})`],
          ['Due off hire', p.ownership === 'HIRED' ? fmtDay(p.offHireDue) : 'Not hired'],
          ['Operator', p.operator ? `${p.operator}${p.operatorCertExpiry ? `, certificate to ${fmtDay(p.operatorCertExpiry)}` : ''}` : '—'],
          ['Last inspected', fmtDay(p.lastInspectedOn)],
          ['Next inspection', `${fmtDay(p.nextInspectionDue)}${p.inspectionIntervalDays ? ` (every ${p.inspectionIntervalDays} days)` : ''}`],
          [p.needsCertificate ? 'Certificate (load test / fitness)' : 'Certificate', fmtDay(p.certificateExpiry)],
          ['Added by', p.addedBy.fullName],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="text-slate-800 dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>

      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}

      {p.can.status && (
        <section className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40" aria-label="Its state">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Its state today</h3>
          <label className={`${labelCls} mt-2`}>
            {p.status === 'BROKEN_DOWN' ? 'Note (what was fixed)' : 'Note (needed if it has broken down)'}
            <input aria-label="State note" className={`${inputCls} mt-0.5`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['WORKING', 'STANDING', 'BROKEN_DOWN'] as const)
              .filter((s) => s !== p.status)
              .map((s) => (
                <button key={s} type="button" disabled={busy || (s === 'BROKEN_DOWN' && !note.trim()) || (s === 'WORKING' && p.outOfUse)} onClick={() => call('/status', { status: s, note: note || undefined })} className={s === 'BROKEN_DOWN' ? secondaryBtn : primaryBtn}>
                  {s === 'WORKING' ? 'Working' : s === 'STANDING' ? 'Standing' : 'Broken down'}
                </button>
              ))}
          </div>
          {p.outOfUse && <p className="mt-1 text-xs text-red-700 dark:text-red-400">It failed its last inspection: record a passed inspection before it works again.</p>}
        </section>
      )}

      {p.can.inspect && (
        <section className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40" aria-label="Record an inspection">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Record an inspection</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className={labelCls}>
              Inspected on
              <DateInput className={`${inputCls} mt-0.5`} value={insp.date} max={todayIso()} onChange={(e) => setInsp({ ...insp, date: e.target.value })} />
            </label>
            <div className={labelCls}>
              Result
              <Select aria-label="Inspection result" className={`${selectCls} mt-0.5 w-full`} value={insp.passed ? 'pass' : 'fail'} onChange={(v) => setInsp({ ...insp, passed: v === 'pass' })} options={[{ value: 'pass', label: 'Passed' }, { value: 'fail', label: 'Failed: take it out of use' }]} />
            </div>
            <label className={labelCls}>
              Inspected by
              <input aria-label="Name or firm" className={`${inputCls} mt-0.5`} value={insp.inspector} onChange={(e) => setInsp({ ...insp, inspector: e.target.value })} placeholder="Name or firm" />
            </label>
            <label className={labelCls}>
              Next due {p.inspectionIntervalDays ? `(blank: in ${p.inspectionIntervalDays} days)` : ''}
              <DateInput className={`${inputCls} mt-0.5`} value={insp.nextDue} onChange={(e) => setInsp({ ...insp, nextDue: e.target.value })} />
            </label>
            <label className={labelCls}>
              New certificate expiry (if renewed)
              <DateInput className={`${inputCls} mt-0.5`} value={insp.certificateExpiry} onChange={(e) => setInsp({ ...insp, certificateExpiry: e.target.value })} />
            </label>
            <label className={labelCls}>
              {insp.passed ? 'Note (optional)' : 'What failed'}
              <input aria-label="Inspection note" className={`${inputCls} mt-0.5`} value={insp.note} onChange={(e) => setInsp({ ...insp, note: e.target.value })} />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !insp.date || (!insp.passed && !insp.note.trim())}
            onClick={async () => {
              const ok = await call('/inspect', { date: insp.date, passed: insp.passed, inspector: insp.inspector || undefined, nextDue: insp.nextDue || undefined, certificateExpiry: insp.certificateExpiry || undefined, note: insp.note || undefined });
              if (ok) setInsp({ date: todayIso(), passed: true, inspector: '', nextDue: '', certificateExpiry: '', note: '' });
            }}
            className={`${primaryBtn} mt-2`}
          >
            Record the inspection
          </button>
        </section>
      )}

      {p.can.edit && (
        <section className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40" aria-label="Operator and hire">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Operator and hire</h3>
            {!operator && (
              <button type="button" onClick={() => setOperator({ operator: p.operator ?? '', operatorCertExpiry: p.operatorCertExpiry?.slice(0, 10) ?? '', offHireDue: p.offHireDue?.slice(0, 10) ?? '' })} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Change
              </button>
            )}
          </div>
          {operator && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <label className={labelCls}>
                Operator
                <input className={`${inputCls} mt-0.5`} value={operator.operator} onChange={(e) => setOperator({ ...operator, operator: e.target.value })} />
              </label>
              <label className={labelCls}>
                Operator’s certificate to
                <DateInput className={`${inputCls} mt-0.5`} value={operator.operatorCertExpiry} onChange={(e) => setOperator({ ...operator, operatorCertExpiry: e.target.value })} />
              </label>
              {p.ownership === 'HIRED' && (
                <label className={labelCls}>
                  Due off hire
                  <DateInput className={`${inputCls} mt-0.5`} value={operator.offHireDue} onChange={(e) => setOperator({ ...operator, offHireDue: e.target.value })} />
                </label>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await call('', { operator: operator.operator.trim() || null, operatorCertExpiry: operator.operatorCertExpiry || null, ...(p.ownership === 'HIRED' ? { offHireDue: operator.offHireDue || null } : {}) }, 'PATCH');
                    if (ok) setOperator(null);
                  }}
                  className={primaryBtn}
                >
                  Save
                </button>
                <button type="button" onClick={() => setOperator(null)} className={secondaryBtn}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {p.can.offSite && (
        <section className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40" aria-label="Off site">
          <label className={labelCls}>
            Left site on
            <DateInput className={`${inputCls} mt-0.5`} value={leave} max={todayIso()} onChange={(e) => setLeave(e.target.value)} />
          </label>
          <button type="button" disabled={busy || !leave} onClick={() => call('/off-site', { date: leave })} className={secondaryBtn}>
            {p.ownership === 'HIRED' ? 'Off hired: left site' : 'Left site'}
          </button>
        </section>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500" aria-label="History">
        {p.history.map((h, k) => (
          <li key={k}>
            {fmtDayTime(h.at)} · {h.name} · {historyLine(h)}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="PLANT_ITEM" entityId={p.id} />
      </div>
    </div>
  );
}

/** Plant and equipment on site (the last of the site manager's items,
 * 2026-11-04). */
export function PlantPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Listing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('item'));
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'on' | 'all'>('on');
  const blank = { description: '', category: 'EARTHMOVING' as Category, fleetNumber: '', ownership: 'HIRED' as 'HIRED' | 'OWNED', supplier: '', contractorId: '', operator: '', operatorCertExpiry: '', arrivedOn: todayIso(), offHireDue: '', inspectionIntervalDays: '', lastInspectedOn: '', certificateExpiry: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Listing>(`/projects/${projectId}/plant`)
      .then(setData)
      .catch((e) => setError(err(e, 'Failed to load the plant register.')));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  if (selectedId) return <Detail projectId={projectId} id={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />;

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const opt = (v: string) => v.trim() || undefined;
    try {
      const p = await authedFetch<Plant>(`/projects/${projectId}/plant`, {
        method: 'POST',
        body: {
          description: form.description.trim(),
          category: form.category,
          fleetNumber: opt(form.fleetNumber),
          ownership: form.ownership,
          supplier: opt(form.supplier),
          contractorId: opt(form.contractorId),
          operator: opt(form.operator),
          operatorCertExpiry: opt(form.operatorCertExpiry),
          arrivedOn: form.arrivedOn,
          offHireDue: form.ownership === 'HIRED' ? opt(form.offHireDue) : undefined,
          inspectionIntervalDays: form.inspectionIntervalDays ? Number(form.inspectionIntervalDays) : undefined,
          lastInspectedOn: opt(form.lastInspectedOn),
          certificateExpiry: opt(form.certificateExpiry),
        },
      });
      setAdding(false);
      setForm(blank);
      load();
      setSelectedId(p.id);
    } catch (e2) {
      setError(err(e2, 'Could not add the plant.'));
    }
  }

  if (!data) return error ? <p className={errBox}>{error}</p> : <p className="text-sm text-slate-400">Loading…</p>;
  const shown = data.plant.filter((p) => filter === 'all' || p.onSite);
  const b = data.board;
  const certified = form.category === 'LIFTING' || form.category === 'ACCESS';

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Tractor size={16} className="text-emerald-700 dark:text-emerald-400" /> Plant &amp; equipment
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              The plant on site, owned or hired: when it came and is due off hire, who operates it, and whether it is working, standing or broken down. Inspections and certificates are flagged as they fall due; a failed inspection takes it out of use. The site diary starts its plant list from here.
            </p>
          </div>
          {data.can.add && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
              <Plus size={14} /> Add plant
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {b.onSite} on site · {b.working} working · {b.standing} standing · <span className={b.brokenDown ? 'text-red-700 dark:text-red-400' : ''}>{b.brokenDown} broken down</span> · <span className={b.inspectionsDue ? 'text-amber-700 dark:text-amber-400' : ''}>{b.inspectionsDue} inspections due</span> · {b.certificates} certificate flags · {b.pastOffHire} past off hire
        </p>

        {adding && (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <label className={`${labelCls} sm:col-span-2`}>
              Plant
              <input className={`${inputCls} mt-0.5`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 20 t excavator" />
            </label>
            <div className={labelCls}>
              Kind
              <Select aria-label="Kind of plant" className={`${selectCls} mt-0.5 w-full`} value={form.category} onChange={(v) => setForm({ ...form, category: v as Category })} options={(Object.keys(CATEGORY) as Category[]).map((c) => ({ value: c, label: CATEGORY[c] }))} />
            </div>
            <label className={labelCls}>
              Fleet no. or registration
              <input className={`${inputCls} mt-0.5`} value={form.fleetNumber} onChange={(e) => setForm({ ...form, fleetNumber: e.target.value })} />
            </label>
            <div className={labelCls}>
              Owned or hired
              <Select aria-label="Owned or hired" className={`${selectCls} mt-0.5 w-full`} value={form.ownership} onChange={(v) => setForm({ ...form, ownership: v as 'HIRED' | 'OWNED' })} options={[{ value: 'HIRED', label: 'Hired' }, { value: 'OWNED', label: 'Owned' }]} />
            </div>
            <label className={labelCls}>
              {form.ownership === 'HIRED' ? 'Hire company' : 'Owner'}
              <input className={`${inputCls} mt-0.5`} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </label>
            {data.can.anyFirm && (
              <div className={labelCls}>
                Whose plant
                <Select aria-label="Whose plant" className={`${selectCls} mt-0.5 w-full`} value={form.contractorId} onChange={(v) => setForm({ ...form, contractorId: v })} options={[{ value: '', label: 'Setjeka / the site' }, ...data.firms.map((f) => ({ value: f.id, label: f.name }))]} />
              </div>
            )}
            <label className={labelCls}>
              Arrived on
              <DateInput className={`${inputCls} mt-0.5`} value={form.arrivedOn} max={todayIso()} onChange={(e) => setForm({ ...form, arrivedOn: e.target.value })} />
            </label>
            {form.ownership === 'HIRED' && (
              <label className={labelCls}>
                Due off hire
                <DateInput className={`${inputCls} mt-0.5`} value={form.offHireDue} onChange={(e) => setForm({ ...form, offHireDue: e.target.value })} />
              </label>
            )}
            <label className={labelCls}>
              Operator
              <input className={`${inputCls} mt-0.5`} value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
            </label>
            <label className={labelCls}>
              Operator’s certificate to
              <DateInput className={`${inputCls} mt-0.5`} value={form.operatorCertExpiry} onChange={(e) => setForm({ ...form, operatorCertExpiry: e.target.value })} />
            </label>
            <label className={labelCls}>
              Inspect every (days)
              <input type="number" min={1} max={730} className={`${inputCls} mt-0.5`} value={form.inspectionIntervalDays} onChange={(e) => setForm({ ...form, inspectionIntervalDays: e.target.value })} placeholder="e.g. 7" />
            </label>
            <label className={labelCls}>
              Last inspected
              <DateInput className={`${inputCls} mt-0.5`} value={form.lastInspectedOn} onChange={(e) => setForm({ ...form, lastInspectedOn: e.target.value })} />
            </label>
            <label className={labelCls}>
              Certificate expiry {certified ? '(load test / fitness)' : '(if any)'}
              <DateInput className={`${inputCls} mt-0.5`} value={form.certificateExpiry} onChange={(e) => setForm({ ...form, certificateExpiry: e.target.value })} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.description.trim() || !form.arrivedOn} className={primaryBtn}>
                Add to the register
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className={`${cardCls} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">The register</h3>
          <Select aria-label="Show" className={`${selectCls} h-9 w-36`} value={filter} onChange={(v) => setFilter(v as 'on' | 'all')} options={[{ value: 'on', label: 'On site' }, { value: 'all', label: 'All, with off site' }]} />
        </div>
        {shown.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">{data.plant.length ? 'Nothing on site.' : 'No plant on the register yet.'}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((p) => (
              <li key={p.id} aria-label={`${p.number} ${p.description}`}>
                <button type="button" onClick={() => setSelectedId(p.id)} className="flex w-full flex-wrap items-start gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {p.number} {p.description}
                    </p>
                    <p className="text-xs text-slate-500">
                      {CATEGORY[p.category]}
                      {p.contractor && ` · ${p.contractor.name}`}
                      {p.operator && ` · ${p.operator}`}
                      {p.nextInspectionDue && p.onSite && ` · next inspection ${fmtDay(p.nextInspectionDue)}`}
                    </p>
                    <div className="mt-1">
                      <Flags p={p} />
                    </div>
                  </div>
                  <span className={`${chip} ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
