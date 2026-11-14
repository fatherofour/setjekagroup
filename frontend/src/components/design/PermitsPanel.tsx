'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, FileWarning, Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { CommentThread } from '@/components/project/CommentThread';
import { HsePanel } from '@/components/design/HsePanel';
import { cardCls, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from '@/lib/architect';

type PType = 'HOT_WORK' | 'WORKING_AT_HEIGHT' | 'EXCAVATION' | 'CONFINED_SPACE' | 'ELECTRICAL_ISOLATION' | 'LIFTING' | 'OTHER';
type Status = 'REQUESTED' | 'ISSUED' | 'SUSPENDED' | 'HANDED_BACK' | 'CLOSED' | 'REJECTED' | 'CANCELLED';

interface Permit {
  id: string;
  number: string;
  type: PType;
  title: string;
  description: string;
  location: string;
  workers: string | null;
  validFrom: string;
  validTo: string;
  checklist: { text: string; done: boolean }[];
  gasTest: string | null;
  status: Status;
  conditions: string | null;
  reason: string | null;
  handBackNote: string | null;
  issuedAt: string | null;
  live: boolean;
  expired: boolean;
  contractor: { id: string; name: string } | null;
  requestedBy: { id: string; fullName: string };
  issuedBy: { fullName: string } | null;
  history: { status: string; at: string; name: string; comment: string | null }[];
  can: { issue: boolean; reject: boolean; suspend: boolean; reinstate: boolean; handBack: boolean; close: boolean; cancel: boolean };
}

interface Listing {
  permits: Permit[];
  board: { live: number; awaiting: number; suspended: number; expired: number; toClose: number };
  can: { request: boolean; issue: boolean };
}

const TYPE: Record<PType, string> = {
  HOT_WORK: 'Hot work',
  WORKING_AT_HEIGHT: 'Working at height',
  EXCAVATION: 'Excavation',
  CONFINED_SPACE: 'Confined space',
  ELECTRICAL_ISOLATION: 'Electrical isolation',
  LIFTING: 'Lifting',
  OTHER: 'Other high-risk work',
};
const STATUS: Record<Status, { label: string; tone: string }> = {
  REQUESTED: { label: 'Waiting to be issued', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  ISSUED: { label: 'Issued', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  SUSPENDED: { label: 'Suspended: stop work', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  HANDED_BACK: { label: 'Handed back, to close', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  CLOSED: { label: 'Closed', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800' },
  REJECTED: { label: 'Not issued', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const local = (offsetHours: number) => {
  const d = new Date(Date.now() + offsetHours * 3_600_000);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const statusOf = (p: Permit) => (p.expired ? { label: 'Expired: hand back', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' } : p.status === 'ISSUED' && p.live ? { label: 'Live', tone: STATUS.ISSUED.tone } : STATUS[p.status]);

function Detail({ projectId, id, onBack, onChanged }: { projectId: string; id: string; onBack: () => void; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [p, setP] = useState<Permit | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/hse/permits/${id}`;

  useEffect(() => {
    authedFetch<Permit>(base)
      .then(setP)
      .catch((e) => setError(err(e, 'Failed to load the permit.')));
  }, [authedFetch, base]);

  async function act(path: string, body: object = {}) {
    setError(null);
    setBusy(true);
    try {
      setP(await authedFetch<Permit>(`${base}/${path}`, { method: 'POST', body }));
      setText('');
      onChanged();
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <p className={error ? errBox : 'text-sm text-slate-400'}>{error ?? 'Loading…'}</p>;
  const st = statusOf(p);
  const needsReason = p.can.reject || p.can.suspend || p.can.cancel;
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All permits
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {p.number} · {p.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {TYPE[p.type]} · {p.location}
            {p.contractor && ` · ${p.contractor.name}`} · asked for by {p.requestedBy.fullName}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.tone}`}>{st.label}</span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
        {fmtDayTime(p.validFrom)} to {fmtDayTime(p.validTo)}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{p.description}</p>
      {p.workers && <p className="mt-2 text-xs text-slate-500">Crew: {p.workers}</p>}
      {p.gasTest && <p className="mt-1 text-xs text-slate-500">Gas test: {p.gasTest}</p>}
      <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
        {p.checklist.map((c, k) => (
          <li key={k} className="flex items-start gap-2">
            {c.done ? <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Confirmed" /> : <X size={15} className="mt-0.5 shrink-0 text-red-600" aria-label="Not confirmed" />}
            <span className="text-slate-700 dark:text-slate-200">{c.text}</span>
          </li>
        ))}
      </ul>
      {p.issuedBy && (
        <p className="mt-2 text-xs text-slate-500">
          Issued by {p.issuedBy.fullName} {fmtDayTime(p.issuedAt)}
          {p.conditions && ` — conditions: ${p.conditions}`}
        </p>
      )}
      {p.reason && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{p.reason}</p>}
      {p.handBackNote && <p className="mt-1 text-xs text-slate-500">Handed back: {p.handBackNote}</p>}

      {(p.can.issue || p.can.reject || p.can.suspend || p.can.reinstate || p.can.handBack || p.can.close || p.can.cancel) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label className={labelCls}>
            {p.can.issue ? 'Conditions, or the reason to turn it down' : needsReason ? 'Reason (needed to suspend or cancel)' : 'Note (optional)'}
            <input className={`${inputCls} mt-0.5 w-full`} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {p.can.issue && (
              <button type="button" disabled={busy} onClick={() => act('issue', { conditions: text || undefined })} className={primaryBtn}>
                Issue the permit
              </button>
            )}
            {p.can.reject && (
              <button type="button" disabled={busy || !text.trim()} onClick={() => act('reject', { reason: text })} className={secondaryBtn}>
                Don&apos;t issue
              </button>
            )}
            {p.can.suspend && (
              <button type="button" disabled={busy || !text.trim()} onClick={() => act('suspend', { reason: text })} className={secondaryBtn}>
                Suspend: stop work
              </button>
            )}
            {p.can.reinstate && (
              <button type="button" disabled={busy} onClick={() => act('reinstate', { note: text || undefined })} className={primaryBtn}>
                Reinstate
              </button>
            )}
            {p.can.handBack && (
              <button type="button" disabled={busy} onClick={() => act('hand-back', { note: text || undefined })} className={p.can.suspend ? secondaryBtn : primaryBtn}>
                Work done, hand back
              </button>
            )}
            {p.can.close && (
              <button type="button" disabled={busy} onClick={() => act('close', { note: text || undefined })} className={primaryBtn}>
                Area safe, close it
              </button>
            )}
            {p.can.cancel && (
              <button type="button" disabled={busy || !text.trim()} onClick={() => act('cancel', { reason: text })} className={secondaryBtn}>
                Cancel the request
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {p.history.map((h, k) => (
          <li key={k}>
            {fmtDayTime(h.at)} · {h.name} · {STATUS[h.status as Status]?.label ?? h.status}
            {h.comment && ` — ${h.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="WORK_PERMIT" entityId={p.id} />
      </div>
    </div>
  );
}

/** Permits to work (the user's choice, 2026-11-04). */
export function PermitsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Listing | null>(null);
  const [checks, setChecks] = useState<Record<PType, string[]> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('permit'));
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const blank = { type: 'HOT_WORK' as PType, title: '', description: '', location: '', workers: '', validFrom: local(0), validTo: local(8), gasTest: '', done: {} as Record<string, boolean>, extra: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Listing>(`/projects/${projectId}/hse/permits`)
      .then(setData)
      .catch((e) => setError(err(e, 'Failed to load the permits.')));
  }, [authedFetch, projectId]);
  useEffect(() => {
    load();
    authedFetch<Record<PType, string[]>>(`/projects/${projectId}/hse/permits/checks`)
      .then(setChecks)
      .catch(() => undefined);
  }, [authedFetch, projectId, load]);

  if (selectedId) return <Detail projectId={projectId} id={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />;

  const list = checks?.[form.type] ?? [];
  const extras = form.extra
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const allDone = list.every((t) => form.done[t]);

  async function request(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await authedFetch<Permit>(`/projects/${projectId}/hse/permits`, {
        method: 'POST',
        body: {
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          workers: form.workers.trim() || undefined,
          validFrom: new Date(form.validFrom).toISOString(),
          validTo: new Date(form.validTo).toISOString(),
          gasTest: form.gasTest.trim() || undefined,
          checklist: [...list.map((t) => ({ text: t, done: Boolean(form.done[t]) })), ...extras.map((t) => ({ text: t, done: true }))],
        },
      });
      setAdding(false);
      setForm(blank);
      load();
      setSelectedId(p.id);
    } catch (e2) {
      setError(err(e2, 'Could not ask for the permit.'));
    }
  }

  const shown = (data?.permits ?? []).filter((p) => filter === 'all' || ['REQUESTED', 'ISSUED', 'SUSPENDED', 'HANDED_BACK'].includes(p.status));
  const b = data?.board;

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <FileWarning size={16} className="text-emerald-700 dark:text-emerald-400" /> Permits to work
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Hot work, work at height, excavations, confined spaces, electrical isolation and lifting need a permit. Ask for one with its precautions confirmed; the HSE or site manager issues it for a set period of up to seven days. Hand it back when the work is done and the area safe.
            </p>
          </div>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
              <Plus size={14} /> Ask for a permit
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={request} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <div className={labelCls}>
              Type of work
              <Select aria-label="Type of work" className={`${selectCls} mt-0.5 w-full`} value={form.type} onChange={(v) => setForm({ ...form, type: v as PType, done: {} })} options={(Object.keys(TYPE) as PType[]).map((t) => ({ value: t, label: TYPE[t] }))} />
            </div>
            <label className={`${labelCls} sm:col-span-2`}>
              The work
              <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Welding balustrade brackets" />
            </label>
            <label className={labelCls}>
              Where
              <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <label className={labelCls}>
              From
              <input type="datetime-local" className={`${inputCls} mt-0.5`} value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
            </label>
            <label className={labelCls}>
              To
              <input type="datetime-local" className={`${inputCls} mt-0.5`} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Crew (optional)
              <input aria-label="Names of the people doing the work" className={`${inputCls} mt-0.5`} value={form.workers} onChange={(e) => setForm({ ...form, workers: e.target.value })} placeholder="Names of the people doing the work" />
            </label>
            <label className={`${labelCls} sm:col-span-4`}>
              Method: how the work will be done
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <fieldset className="sm:col-span-4">
              <legend className={labelCls}>Precautions: confirm each one</legend>
              <ul className="mt-1 space-y-1">
                {list.map((t) => (
                  <li key={t}>
                    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" className="mt-1" checked={Boolean(form.done[t])} onChange={(e) => setForm({ ...form, done: { ...form.done, [t]: e.target.checked } })} />
                      {t}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <label className={`${labelCls} sm:col-span-4`}>
              Other precautions in place, one per line (optional)
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />
            </label>
            {form.type === 'CONFINED_SPACE' && (
              <label className={`${labelCls} sm:col-span-4`}>
                Gas test before entry
                <input className={`${inputCls} mt-0.5`} value={form.gasTest} onChange={(e) => setForm({ ...form, gasTest: e.target.value })} placeholder="e.g. O2 20.9%, LEL 0%, H2S 0 ppm, CO 0 ppm at 07:40" />
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim() || !form.location.trim() || !form.description.trim() || !allDone || (form.type === 'CONFINED_SPACE' && !form.gasTest.trim())} className={primaryBtn}>
                Ask for the permit
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
              {!allDone && <span className="text-xs text-amber-700 dark:text-amber-400">Confirm every precaution first.</span>}
            </div>
          </form>
        )}
      </div>

      {b && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Live now', b.live, ''],
            ['Waiting to be issued', b.awaiting, b.awaiting ? 'text-amber-700 dark:text-amber-400' : ''],
            ['Expired, not handed back', b.expired, b.expired ? 'text-red-700 dark:text-red-400' : ''],
            ['Suspended', b.suspended, b.suspended ? 'text-red-700 dark:text-red-400' : ''],
          ].map(([label, n, tone]) => (
            <div key={label as string} className={`${cardCls} p-3`}>
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`mt-1 text-lg font-semibold ${tone || 'text-slate-900 dark:text-slate-100'}`}>{n}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Permits</h3>
        <Select aria-label="Show permits" className={`${selectCls} h-9 w-32`} value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
      </div>
      {data === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'open' ? 'No open permits.' : 'No permits yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => {
            const st = statusOf(p);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setSelectedId(p.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                  <span className="font-mono text-xs text-slate-500">{p.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{p.title}</span>
                    <span className="block text-xs text-slate-500">
                      {TYPE[p.type]} · {p.location}
                      {p.contractor && ` · ${p.contractor.name}`} · to {fmtDayTime(p.validTo)}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The Health & safety tab: incidents and permits to work. */
export function HseWorkspace({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const [section, setSection] = useState(params.get('permit') || params.get('section') === 'permits' ? 'permits' : 'incidents');
  return (
    <div className="space-y-3">
      <Tabs
        tabs={[
          { value: 'incidents', label: 'Incidents' },
          { value: 'permits', label: 'Permits to work' },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === 'incidents' ? <HsePanel projectId={projectId} /> : <PermitsPanel projectId={projectId} />}
    </div>
  );
}
