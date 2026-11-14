'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, HardHat, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from '@/lib/architect';

type Kind = 'INJURY' | 'PROPERTY_DAMAGE' | 'ENVIRONMENTAL' | 'FIRE' | 'DANGEROUS_OCCURRENCE' | 'SECURITY' | 'OTHER';
type Severity = 'NO_INJURY' | 'FIRST_AID' | 'MEDICAL_TREATMENT' | 'LOST_TIME' | 'FATALITY';
type Status = 'REPORTED' | 'INVESTIGATING' | 'ACTIONS_OPEN' | 'CLOSED';

interface Action {
  id: string;
  description: string;
  dueDate: string | null;
  doneAt: string | null;
  doneNote: string | null;
  owner: { id: string; externalName: string | null; user: { fullName: string } | null } | null;
}

interface Incident {
  id: string;
  number: string;
  title: string;
  kind: Kind;
  severity: Severity;
  occurredAt: string;
  location: string | null;
  description: string;
  immediateAction: string | null;
  personsInvolved: string | null;
  lostDays: number | null;
  status: Status;
  reportable: boolean;
  reportedToDelAt: string | null;
  delReference: string | null;
  rules: { authority: string; short: string; law: string; lostDaysOver: number; rule: string };
  rootCause: string | null;
  investigationNotes: string | null;
  closedAt: string | null;
  serious: boolean;
  openActions: number;
  photoCount: number;
  contractor: { id: string; name: string } | null;
  reportedBy: { id: string; fullName: string };
  closedBy: { fullName: string } | null;
  actions: Action[];
  history: { status: string; at: string; name: string; comment: string | null }[];
  can: { investigate: boolean; addAction: boolean; close: boolean; completeAction: string[]; addPhotos: boolean };
}

interface Stats {
  total: number;
  open: number;
  last12Months: number;
  lostTimeInjuries: number;
  lostDays: number;
  reportable: number;
  daysSinceLostTime: number;
  sinceLostTimeFrom: 'LAST_LOST_TIME' | 'PROJECT_START';
  manHours: number;
  ltifr: number | null;
  rules: { authority: string; short: string; law: string; lostDaysOver: number; rule: string };
}

interface Options {
  members: { id: string; role: string; name: string; firm: string | null; contractorId: string | null }[];
  activities: { id: string; name: string }[];
  you: { contractor: boolean };
}

const KIND: Record<Kind, string> = {
  INJURY: 'Injury',
  PROPERTY_DAMAGE: 'Property or plant damage',
  ENVIRONMENTAL: 'Environmental (spill, dust, water)',
  FIRE: 'Fire',
  DANGEROUS_OCCURRENCE: 'Dangerous occurrence',
  SECURITY: 'Security (theft, trespass)',
  OTHER: 'Other',
};
const SEVERITY: Record<Severity, { label: string; tone: string }> = {
  NO_INJURY: { label: 'No injury', tone: 'text-slate-600 dark:text-slate-300' },
  FIRST_AID: { label: 'First aid', tone: 'text-slate-700 dark:text-slate-200' },
  MEDICAL_TREATMENT: { label: 'Medical treatment', tone: 'text-amber-700 dark:text-amber-400' },
  LOST_TIME: { label: 'Lost time', tone: 'text-red-700 dark:text-red-400' },
  FATALITY: { label: 'Fatality', tone: 'text-red-800 dark:text-red-300' },
};
const STATUS: Record<Status, { label: string; tone: string }> = {
  REPORTED: { label: 'Reported', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  INVESTIGATING: { label: 'Being investigated', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  ACTIONS_OPEN: { label: 'Actions open', tone: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  CLOSED: { label: 'Closed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
};
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const nowLocal = () => {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const who = (o: Action['owner']) => o?.user?.fullName ?? o?.externalName ?? '—';

function Detail({ projectId, id, people, onBack, onChanged }: { projectId: string; id: string; people: Options['members']; onBack: () => void; onChanged: () => void }) {
  const { authedFetch, accessToken } = useAuth();
  const [i, setI] = useState<Incident | null>(null);
  const [inv, setInv] = useState({ severity: '' as Severity | '', lostDays: '', rootCause: '', investigationNotes: '', reportable: false, reportedToDelAt: '', delReference: '' });
  const [action, setAction] = useState({ description: '', ownerId: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ id: string; url: string }[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const base = `/projects/${projectId}/hse/incidents/${id}`;

  const take = useCallback((x: Incident) => {
    setI(x);
    setInv({ severity: x.severity, lostDays: x.lostDays != null ? String(x.lostDays) : '', rootCause: x.rootCause ?? '', investigationNotes: x.investigationNotes ?? '', reportable: x.reportable, reportedToDelAt: x.reportedToDelAt?.slice(0, 10) ?? '', delReference: x.delReference ?? '' });
  }, []);

  useEffect(() => {
    authedFetch<Incident>(base)
      .then(take)
      .catch((e) => setError(err(e, 'Failed to load the incident.')));
  }, [authedFetch, base, take]);

  useEffect(() => {
    if (!i) return;
    let cancelled = false;
    const made: string[] = [];
    authedFetch<{ id: string }[]>(`/projects/${projectId}/site-photos?hseIncidentId=${i.id}`)
      .then(async (photos) => {
        const out = [];
        for (const p of photos.slice(0, 12)) {
          const url = await apiFetchBlobUrl(`/projects/${projectId}/site-photos/${p.id}/file?size=thumb`, accessToken).catch(() => null);
          if (url) {
            made.push(url);
            out.push({ id: p.id, url });
          }
        }
        if (!cancelled) setThumbs(out);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [authedFetch, accessToken, projectId, i]);

  async function run(fn: () => Promise<Incident>) {
    setError(null);
    setBusy(true);
    try {
      take(await fn());
      onChanged();
      return true;
    } catch (e) {
      setError(err(e, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !i) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('hseIncidentId', i.id);
      fd.append('caption', `${i.number} ${i.title}`);
      await authedFetch(`/projects/${projectId}/site-photos`, { method: 'POST', formData: fd }).catch((e) => setError(err(e, 'A photo did not upload')));
    }
    if (photoRef.current) photoRef.current.value = '';
    await authedFetch<Incident>(base)
      .then(take)
      .catch(() => undefined);
    setBusy(false);
  }

  if (!i) return <p className={error ? errBox : 'text-sm text-slate-400'}>{error ?? 'Loading…'}</p>;
  const site = people.filter((p) => p.role !== 'CLIENT');
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All incidents
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {i.number} · {i.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {KIND[i.kind]} · <span className={SEVERITY[i.severity].tone}>{SEVERITY[i.severity].label}</span>
            {i.lostDays != null && ` (${i.lostDays} days lost)`} · {fmtDayTime(i.occurredAt)}
            {i.location && ` · ${i.location}`}
            {i.contractor && ` · ${i.contractor.name}`} · reported by {i.reportedBy.fullName}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {i.reportable && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${i.reportedToDelAt ? 'bg-slate-100 text-slate-600 dark:bg-slate-800' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
              {i.reportedToDelAt ? `Reported to ${i.rules.short} ${fmtDay(i.reportedToDelAt)}` : `Report to ${i.rules.short}`}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
        </span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{i.description}</p>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {i.immediateAction && (
          <div>
            <dt className="text-xs font-medium text-slate-500">Done straight away</dt>
            <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">{i.immediateAction}</dd>
          </div>
        )}
        {i.personsInvolved && (
          <div>
            <dt className="text-xs font-medium text-slate-500">Who was involved</dt>
            <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">{i.personsInvolved}</dd>
          </div>
        )}
        {i.rootCause && !i.can.investigate && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-500">Root cause</dt>
            <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">{i.rootCause}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos ({i.photoCount})</h4>
          {i.can.addPhotos && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => photoRef.current?.click()}>
                <Camera size={14} /> Add photos
              </button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} aria-label="Add photos of the incident" />
            </>
          )}
        </div>
        {thumbs.length > 0 && (
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {thumbs.map((t) => (
              <li key={t.id} className="aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.url} alt={`${i.number} photo`} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {i.can.investigate && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            run(() =>
              authedFetch<Incident>(`${base}/investigation`, {
                method: 'PATCH',
                body: { severity: inv.severity || undefined, lostDays: inv.lostDays === '' ? null : Number(inv.lostDays), rootCause: inv.rootCause, investigationNotes: inv.investigationNotes, reportable: inv.reportable, reportedToDelAt: inv.reportedToDelAt || null, delReference: inv.delReference || null },
              }),
            );
          }}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700"
        >
          <p className="text-sm font-medium text-slate-800 sm:col-span-3 dark:text-slate-100">Investigation</p>
          <div className={labelCls}>
            Severity
            <Select aria-label="Severity" className={`${selectCls} mt-0.5 w-full`} value={inv.severity} onChange={(v) => setInv({ ...inv, severity: v as Severity })} options={(Object.keys(SEVERITY) as Severity[]).map((s) => ({ value: s, label: SEVERITY[s].label }))} />
          </div>
          <label className={labelCls}>
            Days lost
            <input type="number" min={0} className={`${inputCls} mt-0.5`} value={inv.lostDays} onChange={(e) => setInv({ ...inv, lostDays: e.target.value })} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={inv.reportable} onChange={(e) => setInv({ ...inv, reportable: e.target.checked })} />
            Reportable to {i.rules.authority}
          </label>
          <label className={`${labelCls} sm:col-span-3`}>
            Root cause
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={inv.rootCause} onChange={(e) => setInv({ ...inv, rootCause: e.target.value })} />
          </label>
          <label className={`${labelCls} sm:col-span-3`}>
            Findings (optional)
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={inv.investigationNotes} onChange={(e) => setInv({ ...inv, investigationNotes: e.target.value })} />
          </label>
          {inv.reportable && (
            <>
              <label className={labelCls}>
                Reported to {i.rules.short} on
                <input type="date" className={`${inputCls} mt-0.5`} value={inv.reportedToDelAt} onChange={(e) => setInv({ ...inv, reportedToDelAt: e.target.value })} />
              </label>
              <label className={`${labelCls} sm:col-span-2`}>
                Reference
                <input className={`${inputCls} mt-0.5`} value={inv.delReference} onChange={(e) => setInv({ ...inv, delReference: e.target.value })} />
              </label>
            </>
          )}
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy} className={primaryBtn}>
              Save the investigation
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Corrective actions ({i.actions.length})</h4>
        {i.actions.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {i.actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className={`block ${a.doneAt ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{a.description}</span>
                  <span className="block text-[11px] text-slate-500">
                    {who(a.owner)}
                    {a.dueDate && ` · by ${fmtDay(a.dueDate)}`}
                    {a.doneAt && ` · done ${fmtDay(a.doneAt)}${a.doneNote ? `: ${a.doneNote}` : ''}`}
                  </span>
                </span>
                {i.can.completeAction.includes(a.id) && (
                  <button type="button" disabled={busy} onClick={() => run(() => authedFetch<Incident>(`${base}/actions/${a.id}/done`, { method: 'POST', body: {} }))} className={secondaryBtn}>
                    Done
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {i.can.addAction && (
          <form
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (await run(() => authedFetch<Incident>(`${base}/actions`, { method: 'POST', body: { description: action.description.trim(), ownerId: action.ownerId || undefined, dueDate: action.dueDate || undefined } }))) setAction({ description: '', ownerId: '', dueDate: '' });
            }}
            className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
            <label className={`${labelCls} sm:col-span-2`}>
              New corrective action
              <input className={`${inputCls} mt-0.5`} value={action.description} onChange={(e) => setAction({ ...action, description: e.target.value })} placeholder="e.g. Toolbox talk on working at height" />
            </label>
            <div className={labelCls}>
              Owner
              <Select aria-label="Action owner" className={`${selectCls} mt-0.5 w-full`} value={action.ownerId} onChange={(v) => setAction({ ...action, ownerId: v })} options={[{ value: '', label: 'Choose…' }, ...site.map((p) => ({ value: p.id, label: `${p.name}${p.firm ? ` (${p.firm})` : ''}` }))]} />
            </div>
            <label className={labelCls}>
              Due
              <input type="date" className={`${inputCls} mt-0.5`} value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })} />
            </label>
            <div className="sm:col-span-4">
              <button type="submit" disabled={busy || !action.description.trim()} className={secondaryBtn}>
                <Plus size={14} /> Add the action
              </button>
            </div>
          </form>
        )}
      </div>

      {i.can.close && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <button type="button" disabled={busy} onClick={() => run(() => authedFetch<Incident>(`${base}/close`, { method: 'POST', body: {} }))} className={primaryBtn}>
            Close the incident
          </button>
          <span className="text-xs text-slate-500">Once the root cause is recorded, every action is done and any report to {i.rules.short} is recorded.</span>
        </div>
      )}
      {i.closedAt && (
        <p className="mt-3 text-xs text-slate-500">
          Closed by {i.closedBy?.fullName} on {fmtDay(i.closedAt)}
        </p>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {i.history.map((h, k) => (
          <li key={k}>
            {fmtDayTime(h.at)} · {h.name} · {STATUS[h.status as Status]?.label ?? h.status}
            {h.comment && ` — ${h.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="HSE_INCIDENT" entityId={i.id} />
      </div>
    </div>
  );
}

/** HSE incidents (the user's choice, 2026-11-04; no near misses). */
export function HsePanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [rows, setRows] = useState<Incident[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('incident'));
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const blank = { title: '', kind: 'INJURY' as Kind, severity: 'FIRST_AID' as Severity, occurredAt: nowLocal(), location: '', description: '', immediateAction: '', personsInvolved: '', contractorId: '', lostDays: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Incident[]>(`/projects/${projectId}/hse/incidents`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Failed to load the incidents.')));
    authedFetch<Stats>(`/projects/${projectId}/hse/incidents/stats`)
      .then(setStats)
      .catch(() => undefined);
  }, [authedFetch, projectId]);
  useEffect(() => {
    load();
    authedFetch<Options>(`/projects/${projectId}/interfaces/options`)
      .then(setOpts)
      .catch(() => undefined);
  }, [authedFetch, projectId, load]);

  async function report(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const i = await authedFetch<Incident>(`/projects/${projectId}/hse/incidents`, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          kind: form.kind,
          severity: form.severity,
          occurredAt: new Date(form.occurredAt).toISOString(),
          location: form.location.trim() || undefined,
          description: form.description.trim(),
          immediateAction: form.immediateAction.trim() || undefined,
          personsInvolved: form.personsInvolved.trim() || undefined,
          contractorId: form.contractorId || undefined,
          lostDays: form.lostDays === '' ? undefined : Number(form.lostDays),
        },
      });
      setAdding(false);
      setForm(blank);
      load();
      setSelectedId(i.id);
    } catch (e2) {
      setError(err(e2, 'Could not report the incident.'));
    }
  }

  if (selectedId) return <Detail projectId={projectId} id={selectedId} people={opts?.members ?? []} onBack={() => setSelectedId(null)} onChanged={load} />;

  const firms = [...new Map((opts?.members ?? []).filter((m) => m.role === 'CONTRACTOR' && m.contractorId).map((m) => [m.contractorId, m])).values()];
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status !== 'CLOSED');
  const injury = form.kind === 'INJURY';

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <HardHat size={16} className="text-emerald-700 dark:text-emerald-400" /> Health &amp; safety incidents
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Report any incident on site as soon as it is safe to: injuries, damage, spills, fires, dangerous occurrences. The HSE manager investigates, sets corrective actions and closes it. {stats?.rules.rule ?? 'Incidents the law requires to be reported are flagged.'}
            </p>
          </div>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
              <Plus size={14} /> Report an incident
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={report} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <label className={`${labelCls} sm:col-span-2`}>
              What happened
              <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Labourer cut hand on rebar" />
            </label>
            <div className={labelCls}>
              Type
              <Select aria-label="Incident type" className={`${selectCls} mt-0.5 w-full`} value={form.kind} onChange={(v) => setForm({ ...form, kind: v as Kind, severity: v === 'INJURY' ? form.severity : 'NO_INJURY' })} options={(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k] }))} />
            </div>
            <div className={labelCls}>
              Severity
              <Select aria-label="Incident severity" className={`${selectCls} mt-0.5 w-full`} value={form.severity} onChange={(v) => setForm({ ...form, severity: v as Severity })} options={(Object.keys(SEVERITY) as Severity[]).map((s) => ({ value: s, label: SEVERITY[s].label }))} />
            </div>
            <label className={labelCls}>
              When
              <input type="datetime-local" className={`${inputCls} mt-0.5`} value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
            </label>
            <label className={labelCls}>
              Where
              <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            {!opts?.you.contractor && firms.length > 0 && (
              <div className={labelCls}>
                Contractor involved
                <Select aria-label="Contractor involved" className={`${selectCls} mt-0.5 w-full`} value={form.contractorId} onChange={(v) => setForm({ ...form, contractorId: v })} options={[{ value: '', label: 'None' }, ...firms.map((m) => ({ value: m.contractorId ?? '', label: m.firm ?? '' }))]} />
              </div>
            )}
            {injury && (form.severity === 'LOST_TIME' || form.severity === 'FATALITY') && (
              <label className={labelCls}>
                Days lost (so far)
                <input type="number" min={0} className={`${inputCls} mt-0.5`} value={form.lostDays} onChange={(e) => setForm({ ...form, lostDays: e.target.value })} />
              </label>
            )}
            <label className={`${labelCls} sm:col-span-4`}>
              Describe it
              <textarea className={`${textareaCls} mt-0.5`} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              What was done straight away (optional)
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.immediateAction} onChange={(e) => setForm({ ...form, immediateAction: e.target.value })} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Who was involved (optional)
              <textarea aria-label="Names and roles" className={`${textareaCls} mt-0.5`} rows={2} value={form.personsInvolved} onChange={(e) => setForm({ ...form, personsInvolved: e.target.value })} placeholder="Names and roles; no ID numbers" />
            </label>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim() || !form.description.trim()} className={primaryBtn}>
                Report it
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={`${cardCls} p-3`}>
            <p className="text-xs text-slate-500">Days without a lost-time injury</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{stats.daysSinceLostTime}</p>
            <p className="text-xs text-slate-500">{stats.sinceLostTimeFrom === 'PROJECT_START' ? 'since the project started' : 'since the last one'}</p>
          </div>
          <div className={`${cardCls} p-3`}>
            <p className="text-xs text-slate-500">Lost-time injuries</p>
            <p className={`mt-1 text-lg font-semibold ${stats.lostTimeInjuries ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{stats.lostTimeInjuries}</p>
            <p className="text-xs text-slate-500">
              {stats.lostDays} days lost in all
              {stats.ltifr != null && ` · LTIFR ${stats.ltifr} per 200 000 hours (${stats.manHours.toLocaleString('en-ZA')} hours from the site diary)`}
            </p>
          </div>
          <div className={`${cardCls} p-3`}>
            <p className="text-xs text-slate-500">Incidents</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{stats.total}</p>
            <p className="text-xs text-slate-500">
              {stats.last12Months} in the last 12 months · {stats.open} open
            </p>
          </div>
          <div className={`${cardCls} p-3`}>
            <p className="text-xs text-slate-500">Reportable to {stats.rules.short}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{stats.reportable}</p>
            <p className="text-xs text-slate-500">{stats.rules.law}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Incidents</h3>
        <Select aria-label="Show" className={`${selectCls} h-9 w-32`} value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
      </div>
      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'open' ? 'No open incidents.' : 'No incidents reported.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelectedId(r.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{r.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                  <span className="block text-xs text-slate-500">
                    {KIND[r.kind]} · <span className={SEVERITY[r.severity].tone}>{SEVERITY[r.severity].label}</span> · {fmtDay(r.occurredAt)}
                    {r.contractor && ` · ${r.contractor.name}`}
                    {r.openActions > 0 && ` · ${r.openActions} action${r.openActions === 1 ? '' : 's'} open`}
                  </span>
                </span>
                {r.reportable && !r.reportedToDelAt && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Report to {r.rules.short}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
