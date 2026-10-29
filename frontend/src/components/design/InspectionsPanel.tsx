'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, ClipboardCheck, ListChecks, Loader2, Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import {
  INSPECTION_KIND,
  INSPECTION_STATUS,
  OUTCOME,
  ROLE_LABEL,
  cardCls,
  fmtDay,
  fmtDayTime,
  inputCls,
  selectCls,
  labelCls,
  memberName,
  primaryBtn,
  secondaryBtn,
  textareaCls,
  type InspectionKind,
  type InspectionOutcome,
  type InspectionStatus,
  type Member,
} from '@/lib/architect';

type Result = 'PASS' | 'FAIL' | 'NA' | null;
interface Item {
  text: string;
  result: Result;
  note: string | null;
  issueId?: string | null;
}
interface Inspection {
  id: string;
  number: string;
  kind: InspectionKind;
  kindLabel: string;
  title: string;
  workType: string | null;
  location: string | null;
  status: InspectionStatus;
  requestedBy: { id: string; fullName: string };
  requestedFor: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  scheduledFor: string | null;
  template: { id: string; name: string } | null;
  checklist: Item[];
  tally: { pass: number; fail: number; na: number; open: number };
  outcome: InspectionOutcome | null;
  summary: string | null;
  completedAt: string | null;
  completedBy: { fullName: string } | null;
  issues: { id: string; title: string; status: string }[];
  photoCount: number;
  createdAt: string;
  can: { schedule: boolean; record: boolean; cancel: boolean; raiseIssue: boolean };
}
interface Template {
  id: string;
  name: string;
  workType: string | null;
  kind: InspectionKind | null;
  items: string[];
  active: boolean;
}
interface Photo {
  id: string;
  caption: string | null;
}

const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const KIND_OPTIONS = (Object.keys(INSPECTION_KIND) as InspectionKind[]).map((k) => ({ value: k, label: INSPECTION_KIND[k] }));
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Inspection requests and site inspections with checklists (register QHSE
 * rows 66-67; Architect 5.5, 5.8, 5.13, 6.1). The contractor asks for one,
 * Setjeka or a consultant schedules the inspector, who records each
 * checklist item; anything that fails becomes an issue. */
export function InspectionsPanel({ projectId }: { projectId: string }) {
  const { authedFetch, user } = useAuth();
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const [rows, setRows] = useState<Inspection[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('inspection') : null));
  const [request, setRequest] = useState<{ kind: InspectionKind; title: string; workType: string; location: string; templateId: string; requestedFor: string; inspectorId: string; scheduledFor: string } | null>(null);
  const [managing, setManaging] = useState(false);

  const load = useCallback(() => {
    authedFetch<Inspection[]>(`/projects/${projectId}/inspections`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Could not load inspections')));
  }, [authedFetch, projectId]);
  const loadTemplates = useCallback(() => {
    authedFetch<Template[]>(`/inspection-templates${internal ? '?all=1' : ''}`)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [authedFetch, internal]);
  useEffect(() => {
    load();
    loadTemplates();
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [authedFetch, projectId, load, loadTemplates]);

  const myRoles = members.filter((m) => m.userId === user?.id).map((m) => m.role);
  const contractorOnly = !internal && myRoles.length > 0 && myRoles.every((r) => r === 'CONTRACTOR');
  const inspectors = members.filter((m) => m.role !== 'CLIENT' && m.role !== 'CONTRACTOR').map((m) => ({ value: m.id, label: `${memberName(m)} · ${ROLE_LABEL[m.role] ?? m.role}` }));
  const replace = (i: Inspection) => setRows((all) => (all ? (all.some((x) => x.id === i.id) ? all.map((x) => (x.id === i.id ? i : x)) : [i, ...all]) : [i]));
  const shown = (rows ?? []).filter((r) => !status || r.status === status);
  const selected = rows?.find((r) => r.id === selectedId) ?? null;

  async function submitRequest() {
    if (!request) return;
    setError(null);
    try {
      const i = await authedFetch<Inspection>(`/projects/${projectId}/inspections`, {
        method: 'POST',
        body: {
          kind: request.kind,
          title: request.title,
          workType: request.workType || undefined,
          location: request.location || undefined,
          templateId: request.templateId || undefined,
          requestedFor: request.requestedFor ? new Date(request.requestedFor).toISOString() : undefined,
          inspectorId: request.inspectorId || undefined,
          scheduledFor: request.inspectorId && request.scheduledFor ? new Date(request.scheduledFor).toISOString() : undefined,
        },
      });
      replace(i);
      setRequest(null);
      setSelectedId(i.id);
    } catch (e) {
      setError(err(e, 'Could not request it'));
    }
  }

  const counts = (s: InspectionStatus) => (rows ?? []).filter((r) => r.status === s).length;

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ClipboardCheck size={15} /> Inspections
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {contractorOnly
                ? 'Ask for an inspection before you cover up work. Setjeka schedules the inspector and you are told the outcome.'
                : 'Inspection requests from the contractor, and the architect’s and engineers’ site inspections, each checked item by item. A failed item becomes an issue for someone to fix.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {internal && (
              <button type="button" className={secondaryBtn} onClick={() => setManaging((v) => !v)}>
                <ListChecks size={14} /> Checklists
              </button>
            )}
            {!request && (
              <button
                type="button"
                className={primaryBtn}
                onClick={() => {
                  setSelectedId(null);
                  setRequest({ kind: contractorOnly ? 'QUALITY' : 'DESIGN_SUPERVISION', title: '', workType: '', location: '', templateId: '', requestedFor: '', inspectorId: '', scheduledFor: localInput(new Date(Date.now() + 86_400_000)) });
                }}
              >
                <Plus size={14} /> {contractorOnly ? 'Request an inspection' : 'New inspection'}
              </button>
            )}
          </div>
        </div>
        {rows && rows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 ${INSPECTION_STATUS.REQUESTED.tone}`}>{counts('REQUESTED')} requested</span>
            <span className={`rounded-full px-2.5 py-1 ${INSPECTION_STATUS.SCHEDULED.tone}`}>{counts('SCHEDULED')} scheduled</span>
            <span className={`rounded-full px-2.5 py-1 ${INSPECTION_STATUS.COMPLETED.tone}`}>{counts('COMPLETED')} completed</span>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 dark:bg-red-950 dark:text-red-300">{rows.filter((r) => r.outcome === 'NON_CONFORMING').length} not conforming</span>
          </div>
        )}
      </section>

      {managing && internal && <TemplateManager templates={templates} onChanged={loadTemplates} />}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {request && (
        <section className={`${cardCls} p-4`} aria-label="New inspection">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{contractorOnly ? 'Request an inspection' : 'New inspection'}</h3>
            <button type="button" aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setRequest(null)}>
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className={labelCls}>
              Kind
              <Select className={`${selectCls} mt-0.5 w-full`} value={request.kind} onChange={(v) => setRequest({ ...request, kind: v as InspectionKind })} options={KIND_OPTIONS} aria-label="Kind" />
            </div>
            <label className={`${labelCls} lg:col-span-2`}>
              What is to be inspected
              <input className={`${inputCls} mt-0.5`} placeholder="e.g. Level 3 slab before the pour" value={request.title} onChange={(e) => setRequest({ ...request, title: e.target.value })} />
            </label>
            <label className={labelCls}>
              Where
              <input className={`${inputCls} mt-0.5`} placeholder="Block B, gridlines C-F" value={request.location} onChange={(e) => setRequest({ ...request, location: e.target.value })} />
            </label>
            <div className={`${labelCls} lg:col-span-2`}>
              Checklist
              <Select
                className={`${selectCls} mt-0.5 w-full`}
                value={request.templateId}
                onChange={(v) => setRequest({ ...request, templateId: v, workType: templates.find((t) => t.id === v)?.workType ?? request.workType })}
                options={[{ value: '', label: 'No checklist' }, ...templates.filter((t) => t.active).map((t) => ({ value: t.id, label: `${t.name} (${t.items.length} items)` }))]}
                aria-label="Checklist"
              />
            </div>
            <label className={labelCls}>
              Wanted on
              <input type="datetime-local" className={`${inputCls} mt-0.5`} value={request.requestedFor} onChange={(e) => setRequest({ ...request, requestedFor: e.target.value })} />
            </label>
            {!contractorOnly && (
              <>
                <div className={labelCls}>
                  Inspector
                  <Select className={`${selectCls} mt-0.5 w-full`} value={request.inspectorId} onChange={(v) => setRequest({ ...request, inspectorId: v })} options={[{ value: '', label: 'Choose later' }, ...inspectors]} aria-label="Inspector" />
                </div>
                {request.inspectorId && (
                  <label className={labelCls}>
                    Scheduled for
                    <input type="datetime-local" className={`${inputCls} mt-0.5`} value={request.scheduledFor} onChange={(e) => setRequest({ ...request, scheduledFor: e.target.value })} />
                  </label>
                )}
              </>
            )}
          </div>
          <button type="button" className={`${primaryBtn} mt-3`} disabled={!request.title.trim()} onClick={submitRequest}>
            {contractorOnly ? 'Send the request' : request.inspectorId ? 'Schedule it' : 'Add it'}
          </button>
        </section>
      )}

      {!request && selected ? (
        <InspectionDetail key={selected.id} i={selected} projectId={projectId} inspectors={inspectors} members={members} onBack={() => setSelectedId(null)} onChanged={replace} setError={setError} />
      ) : (
        !request && (
          <section className={cardCls} aria-label="Inspections list">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
              <Select className={`${selectCls} w-48`} value={status} onChange={setStatus} options={[{ value: '', label: 'Any status' }, ...(Object.keys(INSPECTION_STATUS) as InspectionStatus[]).map((s) => ({ value: s, label: INSPECTION_STATUS[s].label }))]} aria-label="Filter by status" />
            </div>
            {rows === null ? (
              <p className="p-4 text-sm text-slate-400">Loading…</p>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No inspections yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setSelectedId(r.id)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="w-20 font-mono text-xs font-semibold text-slate-500">{r.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{r.title}</span>
                        <span className="block text-xs text-slate-500">
                          {r.kindLabel}
                          {r.location && ` · ${r.location}`}
                          {r.inspectorName && ` · ${r.inspectorName}`}
                          {r.scheduledFor && r.status === 'SCHEDULED' && ` · ${fmtDayTime(r.scheduledFor)}`}
                        </span>
                      </span>
                      {r.outcome && <span className={`text-xs font-medium ${OUTCOME[r.outcome].tone}`}>{OUTCOME[r.outcome].label}</span>}
                      {r.checklist.length > 0 && r.status !== 'COMPLETED' && (
                        <span className="text-xs text-slate-500">
                          {r.checklist.length - r.tally.open}/{r.checklist.length} checked
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INSPECTION_STATUS[r.status].tone}`}>{INSPECTION_STATUS[r.status].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      )}
    </div>
  );
}

function InspectionDetail({
  i,
  projectId,
  inspectors,
  members,
  onBack,
  onChanged,
  setError,
}: {
  i: Inspection;
  projectId: string;
  inspectors: { value: string; label: string }[];
  members: Member[];
  onBack: () => void;
  onChanged: (i: Inspection) => void;
  setError: (e: string | null) => void;
}) {
  const { authedFetch, accessToken } = useAuth();
  const [items, setItems] = useState<Item[]>(i.checklist);
  const [outcome, setOutcome] = useState<InspectionOutcome | ''>(i.outcome ?? '');
  const [summary, setSummary] = useState(i.summary ?? '');
  const [schedule, setSchedule] = useState(() => ({ inspectorId: i.inspectorId ?? '', scheduledFor: localInput(i.scheduledFor ? new Date(i.scheduledFor) : new Date(Date.now() + 86_400_000)) }));
  const [issueFor, setIssueFor] = useState<{ index: number; title: string; ownerId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<{ id: string; url: string; caption: string | null }[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(items) !== JSON.stringify(i.checklist);

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    authedFetch<Photo[]>(`/projects/${projectId}/site-photos?inspectionId=${i.id}`)
      .then(async (photos) => {
        const out = [];
        for (const p of photos.slice(0, 12)) {
          const url = await apiFetchBlobUrl(`/projects/${projectId}/site-photos/${p.id}/file?size=thumb`, accessToken).catch(() => null);
          if (url) {
            made.push(url);
            out.push({ id: p.id, url, caption: p.caption });
          }
        }
        if (!cancelled) setThumbs(out);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [authedFetch, accessToken, projectId, i.id, i.photoCount]);

  async function call(path: string, method: 'POST' | 'PATCH', body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const updated = await authedFetch<Inspection>(`/projects/${projectId}/inspections/${i.id}${path}`, { method, body });
      onChanged(updated);
      setItems(updated.checklist);
      return true;
    } catch (e) {
      setError(err(e, 'That did not work'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('inspectionId', i.id);
      fd.append('caption', `${i.number} ${i.title}`);
      await authedFetch(`/projects/${projectId}/site-photos`, { method: 'POST', formData: fd }).catch((e) => setError(err(e, 'A photo did not upload')));
    }
    if (photoRef.current) photoRef.current.value = '';
    // Re-read rather than save: a completed inspection takes photos but no edits.
    await authedFetch<Inspection>(`/projects/${projectId}/inspections/${i.id}`)
      .then(onChanged)
      .catch(() => undefined);
    setBusy(false);
  }

  const setItem = (n: number, patch: Partial<Item>) => setItems((all) => all.map((x, k) => (k === n ? { ...x, ...patch } : x)));
  const owners = members.filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: memberName(m) }));
  const RESULTS: { value: Exclude<Result, null>; label: string; on: string }[] = [
    { value: 'PASS', label: 'Pass', on: 'bg-emerald-600 text-white border-emerald-600' },
    { value: 'FAIL', label: 'Fail', on: 'bg-red-600 text-white border-red-600' },
    { value: 'NA', label: 'N/A', on: 'bg-slate-500 text-white border-slate-500' },
  ];

  return (
    <section className={`${cardCls} p-4`} aria-label={`${i.number} ${i.title}`}>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft size={13} /> All inspections
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-slate-500">
            {i.number} · {i.kindLabel}
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{i.title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {[i.location, i.workType, `requested by ${i.requestedBy.fullName}`, i.requestedFor && `wanted ${fmtDayTime(i.requestedFor)}`].filter(Boolean).join(' · ')}
          </p>
          {i.inspectorName && (
            <p className="text-xs text-slate-500">
              Inspector {i.inspectorName}
              {i.scheduledFor && ` · ${fmtDayTime(i.scheduledFor)}`}
            </p>
          )}
        </div>
        <div className="text-right">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${INSPECTION_STATUS[i.status].tone}`}>{INSPECTION_STATUS[i.status].label}</span>
          {i.outcome && <p className={`mt-1.5 text-sm font-semibold ${OUTCOME[i.outcome].tone}`}>{OUTCOME[i.outcome].label}</p>}
          {i.outcome === 'NON_CONFORMING' && (
            <Link href={`/projects/${projectId}?tab=ncrs&fromInspection=${i.id}`} className="mt-1 block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Raise an NCR for this
            </Link>
          )}
        </div>
      </div>

      {i.can.schedule && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className={`${labelCls} min-w-[220px]`}>
            Inspector
            <Select className={`${selectCls} mt-0.5 w-full`} value={schedule.inspectorId} onChange={(v) => setSchedule({ ...schedule, inspectorId: v })} options={[{ value: '', label: 'Choose…' }, ...inspectors]} aria-label="Inspector" />
          </div>
          <label className={labelCls}>
            When
            <input type="datetime-local" className={`${inputCls} mt-0.5`} value={schedule.scheduledFor} onChange={(e) => setSchedule({ ...schedule, scheduledFor: e.target.value })} />
          </label>
          <button type="button" className={secondaryBtn} disabled={busy || !schedule.inspectorId} onClick={() => call('/schedule', 'POST', { inspectorId: schedule.inspectorId, scheduledFor: new Date(schedule.scheduledFor).toISOString() })}>
            {i.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
          </button>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist{i.template ? ` · ${i.template.name}` : ''}</h4>
          {items.length > 0 && (
            <span className="text-xs text-slate-500">
              {i.tally.pass} pass · {i.tally.fail} fail · {i.tally.na} n/a · {i.tally.open} open
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No checklist on this inspection.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {items.map((it, n) => (
              <li key={n} className={`rounded-lg border p-2.5 ${it.result === 'FAIL' ? 'border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20' : 'border-slate-100 dark:border-slate-800'}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="w-5 pt-1 text-right font-mono text-xs text-slate-400">{n + 1}</span>
                  <p className="min-w-0 flex-1 pt-0.5 text-sm text-slate-800 dark:text-slate-100">{it.text}</p>
                  <div className="flex gap-1" role="group" aria-label={`Result for item ${n + 1}`}>
                    {RESULTS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        disabled={!i.can.record}
                        aria-pressed={it.result === r.value}
                        onClick={() => setItem(n, { result: it.result === r.value ? null : r.value })}
                        className={`h-9 min-w-[48px] rounded-md border px-2 text-xs font-semibold disabled:cursor-default ${it.result === r.value ? r.on : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                {(i.can.record || it.note) && (
                  <div className="mt-1.5 pl-7">
                    {i.can.record ? (
                      <input className={`${inputCls} h-8 text-xs`} placeholder="Note (what was seen, what needs doing)" value={it.note ?? ''} onChange={(e) => setItem(n, { note: e.target.value })} aria-label={`Note for item ${n + 1}`} />
                    ) : (
                      <p className="text-xs text-slate-600 dark:text-slate-300">{it.note}</p>
                    )}
                  </div>
                )}
                {it.result === 'FAIL' && (
                  <div className="mt-1.5 pl-7 text-xs">
                    {it.issueId ? (
                      <span className="text-red-700 dark:text-red-400">Issue raised: {i.issues.find((x) => x.id === it.issueId)?.title ?? 'see Issues'}</span>
                    ) : i.can.raiseIssue && !dirty ? (
                      issueFor?.index === n ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input className={`${inputCls} h-8 max-w-sm text-xs`} value={issueFor.title} onChange={(e) => setIssueFor({ ...issueFor, title: e.target.value })} aria-label="Issue title" />
                          <Select className={`${selectCls} w-52`} value={issueFor.ownerId} onChange={(v) => setIssueFor({ ...issueFor, ownerId: v })} options={[{ value: '', label: 'Owner…' }, ...owners]} aria-label="Issue owner" />
                          <button
                            type="button"
                            className={secondaryBtn}
                            disabled={busy || !issueFor.title.trim()}
                            onClick={async () => {
                              if (await call('/issues', 'POST', { title: issueFor.title, itemIndex: n, ownerId: issueFor.ownerId || undefined, description: it.note || undefined })) setIssueFor(null);
                            }}
                          >
                            Raise issue
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="font-medium text-red-700 hover:underline dark:text-red-400" onClick={() => setIssueFor({ index: n, title: it.note || it.text, ownerId: '' })}>
                          Raise an issue for this
                        </button>
                      )
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {i.can.record && dirty && (
          <button type="button" className={`${secondaryBtn} mt-2`} disabled={busy} onClick={() => call('', 'PATCH', { checklist: items })}>
            Save progress
          </button>
        )}
      </div>

      {i.can.record && (
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
          <div className={labelCls}>
            Outcome
            <Select className={`${selectCls} mt-0.5 w-full`} value={outcome} onChange={(v) => setOutcome(v as InspectionOutcome)} options={[{ value: '', label: 'Choose…' }, ...(Object.keys(OUTCOME) as InspectionOutcome[]).map((o) => ({ value: o, label: OUTCOME[o].label }))]} aria-label="Outcome" />
          </div>
          <label className={`${labelCls} sm:col-span-2`}>
            Summary
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <div className="sm:col-span-3">
            <button type="button" className={primaryBtn} disabled={busy || !outcome} onClick={() => call('/complete', 'POST', { outcome, summary: summary || undefined, checklist: items })}>
              {busy && <Loader2 size={14} className="animate-spin" />} Complete the inspection
            </button>
          </div>
        </div>
      )}

      {i.status === 'COMPLETED' && (
        <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">
          Completed {fmtDayTime(i.completedAt)} by {i.completedBy?.fullName}
          {i.summary && <span className="mt-1 block whitespace-pre-wrap text-slate-600 dark:text-slate-300">{i.summary}</span>}
        </p>
      )}

      {i.issues.length > 0 && (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          Issues raised: {i.issues.map((x) => `${x.title} (${x.status.toLowerCase().replace(/_/g, ' ')})`).join('; ')}
        </p>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos ({i.photoCount})</h4>
          {i.status !== 'CANCELLED' && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => photoRef.current?.click()}>
                <Camera size={14} /> Add photos
              </button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} aria-label="Add inspection photos" />
            </>
          )}
        </div>
        {thumbs.length > 0 && (
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {thumbs.map((t) => (
              <li key={t.id} className="aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.url} alt={t.caption ?? 'Inspection photo'} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {i.can.cancel && (
        <button type="button" className="mt-4 text-xs text-slate-500 hover:underline" onClick={() => window.confirm(`Cancel ${i.number}?`) && call('/cancel', 'POST')}>
          Cancel this inspection
        </button>
      )}

      <div className="mt-5">
        <CommentThread projectId={projectId} entityType="INSPECTION" entityId={i.id} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Raised {fmtDay(i.createdAt)}</p>
    </section>
  );
}

function TemplateManager({ templates, onChanged }: { templates: Template[]; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [edit, setEdit] = useState<{ id: string | null; name: string; workType: string; kind: string; items: string; active: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!edit) return;
    setError(null);
    const body = { name: edit.name, workType: edit.workType || null, kind: edit.kind || null, items: edit.items.split('\n').map((x) => x.trim()).filter(Boolean), active: edit.active };
    try {
      await authedFetch(edit.id ? `/inspection-templates/${edit.id}` : '/inspection-templates', { method: edit.id ? 'PUT' : 'POST', body });
      setEdit(null);
      onChanged();
    } catch (e) {
      setError(err(e, 'Could not save the checklist'));
    }
  }

  return (
    <section className={`${cardCls} p-4`} aria-label="Checklists">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Checklists</h3>
          <p className="text-xs text-slate-500">Setjeka&apos;s checklists by work type, used across every project. Editing one never changes an inspection already recorded.</p>
        </div>
        {!edit && (
          <button type="button" className={secondaryBtn} onClick={() => setEdit({ id: null, name: '', workType: '', kind: '', items: '', active: true })}>
            <Plus size={14} /> New checklist
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {edit && (
        <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
          <label className={labelCls}>
            Name
            <input className={`${inputCls} mt-0.5`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className={labelCls}>
            Work type
            <input className={`${inputCls} mt-0.5`} value={edit.workType} onChange={(e) => setEdit({ ...edit, workType: e.target.value })} />
          </label>
          <div className={labelCls}>
            Kind of inspection
            <Select className={`${selectCls} mt-0.5 w-full`} value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v })} options={[{ value: '', label: 'Any' }, ...KIND_OPTIONS]} aria-label="Kind of inspection" />
          </div>
          <label className={`${labelCls} sm:col-span-3`}>
            Items, one per line
            <textarea className={`${textareaCls} mt-0.5 font-mono text-xs`} rows={8} value={edit.items} onChange={(e) => setEdit({ ...edit, items: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
            In use
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="button" className={primaryBtn} disabled={!edit.name.trim() || !edit.items.trim()} onClick={save}>
              Save checklist
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100">
              {t.name}
              <span className="ml-1 text-xs text-slate-500">
                · {t.items.length} items{t.workType && ` · ${t.workType}`}
                {!t.active && ' · not in use'}
              </span>
            </span>
            <button
              type="button"
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              onClick={() => setEdit({ id: t.id, name: t.name, workType: t.workType ?? '', kind: t.kind ?? '', items: t.items.join('\n'), active: t.active })}
            >
              Edit
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
