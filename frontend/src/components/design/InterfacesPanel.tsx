'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Plus, Waypoints } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { ROLE_LABEL, cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

type Status = 'OPEN' | 'PROPOSED' | 'AGREED' | 'CLOSED' | 'CANCELLED';
type Kind = 'PHYSICAL' | 'FUNCTIONAL' | 'SPATIAL' | 'INFORMATION' | 'SCHEDULE' | 'CONTRACTUAL';
interface Side {
  id: string;
  role: string;
  externalName: string | null;
  user: { fullName: string } | null;
}

interface Iface {
  id: string;
  number: string;
  title: string;
  description: string | null;
  type: Kind;
  location: string | null;
  status: Status;
  needBy: string | null;
  agreedDetail: string | null;
  agreedAt: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  overdue: boolean;
  owner: Side;
  accepter: Side;
  scheduleActivity: { id: string; name: string } | null;
  rfi: { id: string; rfiNumber: string; title: string } | null;
  agreedBy: { fullName: string } | null;
  createdBy: { id: string; fullName: string };
  history: { status: Status; at: string; name: string; comment: string | null }[];
  can: { propose: boolean; agree: boolean; reject: boolean; close: boolean; cancel: boolean };
}

interface Options {
  members: { id: string; role: string; name: string; firm: string | null }[];
  activities: { id: string; name: string }[];
  rfis: { id: string; rfiNumber: string; title: string }[];
  you: { contractor: boolean; quality: boolean; site: boolean; memberIds: string[] };
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  OPEN: { label: 'Detail to propose', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  PROPOSED: { label: 'Proposed, to agree', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  AGREED: { label: 'Agreed', tone: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  CLOSED: { label: 'Closed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const KIND: Record<Kind, string> = { PHYSICAL: 'Physical', FUNCTIONAL: 'Functional', SPATIAL: 'Spatial', INFORMATION: 'Information', SCHEDULE: 'Programme', CONTRACTUAL: 'Contractual' };
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const who = (s: Side) => `${s.user?.fullName ?? s.externalName ?? 'Unnamed'} (${ROLE_LABEL[s.role] ?? s.role})`;

function Detail({ projectId, f, onBack, onChanged }: { projectId: string; f: Iface; onBack: () => void; onChanged: (x: Iface) => void }) {
  const { authedFetch } = useAuth();
  const [detail, setDetail] = useState(f.agreedDetail ?? '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body: object = {}) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await authedFetch<Iface>(`/projects/${projectId}/interfaces/${f.id}/${path}`, { method: 'POST', body }));
      setComment('');
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All interfaces
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {f.number} · {f.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {KIND[f.type]} interface
            {f.location && ` · ${f.location}`}
            {f.needBy && ` · needed by ${fmtDay(f.needBy)}`}
            {f.scheduleActivity && ` · activity "${f.scheduleActivity.name}"`} · raised by {f.createdBy.fullName}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {f.overdue && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[f.status].tone}`}>{STATUS[f.status].label}</span>
        </span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
        <span>
          <span className="block text-xs text-slate-500">Provides it</span>
          <span className="font-medium text-slate-800 dark:text-slate-100">{who(f.owner)}</span>
        </span>
        <ArrowRight size={16} className="text-slate-400" aria-hidden />
        <span>
          <span className="block text-xs text-slate-500">Depends on it</span>
          <span className="font-medium text-slate-800 dark:text-slate-100">{who(f.accepter)}</span>
        </span>
      </div>
      {f.description && <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{f.description}</p>}
      {f.rfi && (
        <p className="mt-2 text-xs text-slate-500">
          RFI{' '}
          <Link href={`/projects/${projectId}?tab=technical`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            {f.rfi.rfiNumber} {f.rfi.title}
          </Link>
        </p>
      )}
      {f.agreedDetail && !f.can.propose && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500">{f.status === 'PROPOSED' ? 'Proposed detail' : 'Agreed detail'}</p>
          <p className="whitespace-pre-line text-slate-800 dark:text-slate-100">{f.agreedDetail}</p>
          {f.agreedBy && <p className="mt-1 text-xs text-slate-500">Agreed by {f.agreedBy.fullName} on {fmtDay(f.agreedAt)}</p>}
        </div>
      )}
      {f.rejectReason && f.status === 'OPEN' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Last proposal not agreed: {f.rejectReason}</p>}
      {f.cancelReason && <p className="mt-2 text-xs text-slate-500">Cancelled: {f.cancelReason}</p>}

      {f.can.propose && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            act('propose', { agreedDetail: detail });
          }}
          className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
        >
          <label className={labelCls}>
            The detail you propose: sizes, positions, loads, dates, drawing references
            <textarea className={`${textareaCls} mt-0.5`} rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || !detail.trim()} className={primaryBtn}>
            Propose the detail
          </button>
        </form>
      )}

      {(f.can.agree || f.can.close || f.can.cancel) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label className={labelCls}>
            {f.can.reject || f.can.cancel ? 'Comment (needed to turn it down or cancel)' : 'Comment (optional)'}
            <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {f.can.agree && (
              <button type="button" disabled={busy} onClick={() => act('agree', { comment: comment || undefined })} className={primaryBtn}>
                Agree the detail
              </button>
            )}
            {f.can.reject && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('reject', { reason: comment })} className={secondaryBtn}>
                Not agreed, send back
              </button>
            )}
            {f.can.close && (
              <button type="button" disabled={busy} onClick={() => act('close', { comment: comment || undefined })} className={primaryBtn}>
                Built as agreed, close it
              </button>
            )}
            {f.can.cancel && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => confirm(`Cancel ${f.number}?`) && act('cancel', { reason: comment })} className={secondaryBtn}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {f.history.map((e, i) => (
          <li key={i}>
            {fmtDayTime(e.at)} · {e.name} · {STATUS[e.status]?.label ?? e.status}
            {e.comment && ` — ${e.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="INTERFACE" entityId={f.id} />
      </div>
    </div>
  );
}

/** The interfaces register (the user's choice, 2026-11-03): hand-overs
 * between two parties, agreed in writing before they are built. */
export function InterfacesPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [rows, setRows] = useState<Iface[] | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('interface'));
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'open' | 'mine' | 'all'>('open');
  const blank = { title: '', description: '', type: 'PHYSICAL' as Kind, location: '', ownerId: '', accepterId: '', needBy: '', scheduleActivityId: '', rfiId: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Iface[]>(`/projects/${projectId}/interfaces`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Failed to load the interfaces.')));
    authedFetch<Options>(`/projects/${projectId}/interfaces/options`)
      .then(setOpts)
      .catch(() => undefined);
  }, [authedFetch, projectId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const f = await authedFetch<Iface>(`/projects/${projectId}/interfaces`, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          location: form.location.trim() || undefined,
          ownerId: form.ownerId,
          accepterId: form.accepterId,
          needBy: form.needBy || undefined,
          scheduleActivityId: form.scheduleActivityId || undefined,
          rfiId: form.rfiId || undefined,
        },
      });
      setRows((r) => [f, ...(r ?? [])]);
      setAdding(false);
      setForm(blank);
    } catch (e2) {
      setError(err(e2, 'Could not add the interface.'));
    }
  }

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  if (selected) return <Detail projectId={projectId} f={selected} onBack={() => setSelectedId(null)} onChanged={(x) => setRows((r) => (r ?? []).map((y) => (y.id === x.id ? x : y)))} />;

  const mine = new Set(opts?.you.memberIds ?? []);
  const shown = (rows ?? []).filter((r) => (filter === 'all' ? true : filter === 'mine' ? (r.can.propose || r.can.agree || mine.has(r.owner.id) || mine.has(r.accepter.id)) && (r.status === 'OPEN' || r.status === 'PROPOSED') : r.status === 'OPEN' || r.status === 'PROPOSED' || r.status === 'AGREED'));
  const people = (opts?.members ?? []).map((m) => ({ value: m.id, label: `${m.name} · ${ROLE_LABEL[m.role] ?? m.role}${m.firm ? ` (${m.firm})` : ''}` }));
  const overdue = (rows ?? []).filter((r) => r.overdue).length;

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Waypoints size={16} className="text-emerald-700 dark:text-emerald-400" /> Interfaces
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Where one party&apos;s work depends on another&apos;s: a slab penetration for ductwork, a cast-in plate for steel, a sleeve for a cable. Whoever provides it proposes the detail; whoever depends on it agrees it before it is built.
              {overdue > 0 && <span className="ml-1 font-medium text-red-700 dark:text-red-400">{overdue} overdue.</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Show"
              className={`${selectCls} h-9 w-36`}
              value={filter}
              onChange={(v) => setFilter(v as 'open' | 'mine' | 'all')}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'mine', label: 'Waiting on me' },
                { value: 'all', label: 'All' },
              ]}
            />
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
                <Plus size={14} /> Add an interface
              </button>
            )}
          </div>
        </div>

        {adding && (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <label className={`${labelCls} sm:col-span-3`}>
              The interface
              <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Penetrations in level 2 slab for AHU ductwork" />
            </label>
            <div className={labelCls}>
              Kind
              <Select aria-label="Kind" className={`${selectCls} mt-0.5 w-full`} value={form.type} onChange={(v) => setForm({ ...form, type: v as Kind })} options={(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k] }))} />
            </div>
            <div className={`${labelCls} sm:col-span-2`}>
              Provided by
              <Select aria-label="Provided by" className={`${selectCls} mt-0.5 w-full`} value={form.ownerId} onChange={(v) => setForm({ ...form, ownerId: v })} options={[{ value: '', label: 'Choose…' }, ...people]} />
            </div>
            <div className={`${labelCls} sm:col-span-2`}>
              Needed by (depends on it)
              <Select aria-label="Depends on it" className={`${selectCls} mt-0.5 w-full`} value={form.accepterId} onChange={(v) => setForm({ ...form, accepterId: v })} options={[{ value: '', label: 'Choose…' }, ...people.filter((p) => p.value !== form.ownerId)]} />
            </div>
            <label className={`${labelCls} sm:col-span-4`}>
              Details (optional)
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className={labelCls}>
              Where
              <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <label className={labelCls}>
              Agree by
              <DateInput className={`${inputCls} mt-0.5`} value={form.needBy} onChange={(e) => setForm({ ...form, needBy: e.target.value })} />
            </label>
            <div className={labelCls}>
              Programme activity
              <Select aria-label="Programme activity" className={`${selectCls} mt-0.5 w-full`} value={form.scheduleActivityId} onChange={(v) => setForm({ ...form, scheduleActivityId: v })} options={[{ value: '', label: 'None' }, ...(opts?.activities ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
            </div>
            <div className={labelCls}>
              RFI
              <Select aria-label="RFI" className={`${selectCls} mt-0.5 w-full`} value={form.rfiId} onChange={(v) => setForm({ ...form, rfiId: v })} options={[{ value: '', label: 'None' }, ...(opts?.rfis ?? []).map((r) => ({ value: r.id, label: `${r.rfiNumber} ${r.title}` }))]} />
            </div>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim() || !form.ownerId || !form.accepterId} className={primaryBtn}>
                Add the interface
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'all' ? 'No interfaces on this project.' : 'Nothing open.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setSelectedId(f.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{f.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{f.title}</span>
                  <span className="block text-xs text-slate-500">
                    {f.owner.user?.fullName ?? f.owner.externalName} → {f.accepter.user?.fullName ?? f.accepter.externalName}
                    {f.needBy && ` · by ${fmtDay(f.needBy)}`}
                  </span>
                </span>
                {f.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[f.status].tone}`}>{STATUS[f.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
