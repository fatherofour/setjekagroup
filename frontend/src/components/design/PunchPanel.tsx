'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Camera, CheckCircle2, FileDown, MapPin, Plus, RotateCcw, Send, Trash2, Undo2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { downloadFile } from '@/lib/files';
import { cardCls, fmtDay, inputCls, labelCls, memberName, primaryBtn, secondaryBtn, selectCls, textareaCls, type Member } from '@/lib/architect';
import { PlanView, type PlanPin } from './PlanView';
import { DateInput } from '@/components/ui/DateInput';

type Status = 'OPEN' | 'READY_FOR_INSPECTION' | 'CLOSED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
interface PunchItem {
  id: string;
  number: string;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  priority: Priority;
  status: Status;
  documentId: string | null;
  revisionId: string | null;
  page: number | null;
  x: number | null;
  y: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeCompany: string | null;
  dueDate: string | null;
  overdue: boolean;
  raisedBy: { id: string; fullName: string };
  readyAt: string | null;
  readyNote: string | null;
  closedAt: string | null;
  closedBy: { fullName: string } | null;
  rejectedNote: string | null;
  document: { id: string; name: string; drawingNumber: string | null } | null;
  revision: { id: string; revisionNumber: string } | null;
  photoCount: number;
  createdAt: string;
  can: { edit: boolean; markReady: boolean; inspect: boolean; reopen: boolean };
}
interface DrawingLite {
  id: string;
  drawingNumber: string;
  title: string;
  current: { id: string; revisionNumber: string; originalFilename: string } | null;
}

const STATUS: Record<Status, { label: string; tone: string; pin: string }> = {
  OPEN: { label: 'Open', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', pin: '#dc2626' },
  READY_FOR_INSPECTION: { label: 'Ready for inspection', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', pin: '#d97706' },
  CLOSED: { label: 'Closed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', pin: '#16a34a' },
};
const PRIORITY: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const empty = { title: '', description: '', category: '', location: '', priority: 'MEDIUM' as Priority, assigneeId: '', dueDate: '' };

/** The punch list (snags): items pinned on the drawing, given to whoever
 * puts them right, inspected and closed by the architect or Setjeka. */
export function PunchPanel({ projectId }: { projectId: string }) {
  const { authedFetch, accessToken } = useAuth();
  const params = useSearchParams();
  const [items, setItems] = useState<PunchItem[] | null>(null);
  const [drawings, setDrawings] = useState<DrawingLite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<'' | Status>('');
  const [sheet, setSheet] = useState('');
  const [selected, setSelected] = useState<string | null>(params.get('item'));
  const [form, setForm] = useState<(typeof empty & { id?: string; place?: { page: number; x: number; y: number } | null }) | null>(null);
  const [placing, setPlacing] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<PunchItem[]>(`/projects/${projectId}/punch-items`)
      .then(setItems)
      .catch((e) => setError(err(e, 'Could not load the punch list')));
  }, [authedFetch, projectId]);
  useEffect(() => {
    load();
    authedFetch<DrawingLite[]>(`/projects/${projectId}/drawings`)
      .then((d) => setDrawings(d.filter((x) => x.current)))
      .catch(() => setDrawings([]));
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [authedFetch, projectId, load]);

  // Until a sheet is chosen: the sheet of a linked item, else the busiest.
  const autoSheet = useMemo(() => {
    if (!items || !drawings.length) return '';
    const linked = items.find((i) => i.id === params.get('item'))?.documentId;
    const counts = new Map<string, number>();
    for (const i of items) if (i.documentId) counts.set(i.documentId, (counts.get(i.documentId) ?? 0) + 1);
    const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const pick = linked ?? busiest ?? drawings[0].id;
    return drawings.some((d) => d.id === pick) ? pick : drawings[0].id;
  }, [items, drawings, params]);
  const sheetId = sheet || autoSheet;

  const drawing = drawings.find((d) => d.id === sheetId) ?? null;
  const shown = useMemo(() => (items ?? []).filter((i) => !status || i.status === status), [items, status]);
  const counts = useMemo(() => {
    const c = { OPEN: 0, READY_FOR_INSPECTION: 0, CLOSED: 0, overdue: 0 };
    for (const i of items ?? []) {
      c[i.status]++;
      if (i.overdue) c.overdue++;
    }
    return c;
  }, [items]);
  const pins: PlanPin[] = shown
    .filter((i) => i.revisionId && i.revisionId === drawing?.current?.id && i.x != null && i.y != null)
    .map((i) => ({ id: i.id, page: i.page ?? 1, x: i.x!, y: i.y!, label: i.number.replace(/^\D+-?0*/, ''), colour: STATUS[i.status].pin, title: `${i.number} ${i.title}` }));
  const onOlder = drawing ? shown.filter((i) => i.documentId === drawing.id && i.revisionId !== drawing.current?.id).length : 0;
  const item = items?.find((i) => i.id === selected) ?? null;
  const assignees = members.filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: `${memberName(m)}${m.contractor ? ` (${m.contractor.name})` : ''}` }));

  async function save() {
    if (!form || !form.title.trim()) return;
    setError(null);
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      location: form.location.trim() || null,
      priority: form.priority,
      assigneeId: form.assigneeId || null,
      dueDate: form.dueDate || null,
    };
    if (form.place && drawing?.current) Object.assign(body, { revisionId: drawing.current.id, page: form.place.page, x: form.place.x, y: form.place.y });
    try {
      const saved = await authedFetch<PunchItem>(form.id ? `/projects/${projectId}/punch-items/${form.id}` : `/projects/${projectId}/punch-items`, { method: form.id ? 'PATCH' : 'POST', body });
      setForm(null);
      setSelected(saved.id);
      load();
    } catch (e) {
      setError(err(e, 'Could not save the item'));
    }
  }

  async function act(i: PunchItem, path: string, body?: Record<string, unknown>) {
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/punch-items/${i.id}${path}`, { method: 'POST', body });
      setNote('');
      load();
    } catch (e) {
      setError(err(e, 'That did not work'));
    }
  }

  async function remove(i: PunchItem) {
    if (!confirm(`Delete ${i.number}?`)) return;
    try {
      await authedFetch(`/projects/${projectId}/punch-items/${i.id}`, { method: 'DELETE' });
      setSelected(null);
      load();
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Punch list</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-500 dark:text-slate-400">Snags pinned on the drawing. Whoever is given an item says when it is done; the architect or Setjeka inspects it and closes it or sends it back.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} disabled={!items?.length} onClick={() => downloadFile(`/projects/${projectId}/punch-items/pdf`, accessToken, 'Punch list.pdf').catch((e) => setError(err(e, 'Could not make the PDF')))}>
              <FileDown size={14} /> PDF
            </button>
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                setForm({ ...empty, place: null });
                setPlacing(Boolean(drawing));
                setSelected(null);
              }}
            >
              <Plus size={14} /> Add item
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {(['OPEN', 'READY_FOR_INSPECTION', 'CLOSED'] as Status[]).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)} className={`rounded-full px-2.5 py-1 font-medium ${status === s ? 'ring-2 ring-emerald-600' : ''} ${STATUS[s].tone}`}>
              {STATUS[s].label}: {counts[s]}
            </button>
          ))}
          {counts.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 font-medium text-white">
              <AlertTriangle size={11} /> {counts.overdue} overdue
            </span>
          )}
        </div>
      </section>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className={cardCls} aria-label="Plan">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
            <Select
              className={`${selectCls} w-full max-w-md`}
              value={sheetId}
              onChange={(v) => {
                setSheet(v);
                setPlacing(false);
              }}
              options={[{ value: '', label: drawings.length ? 'Choose a drawing…' : 'No drawings on the register yet' }, ...drawings.map((d) => ({ value: d.id, label: `${d.drawingNumber} · ${d.title} (rev ${d.current!.revisionNumber})` }))]}
              aria-label="Drawing"
            />
            {drawing && form && !form.id && (
              <button type="button" className={secondaryBtn} onClick={() => setPlacing((p) => !p)} aria-pressed={placing}>
                <MapPin size={14} /> {form.place ? 'Move the pin' : placing ? 'Placing…' : 'Pin on this sheet'}
              </button>
            )}
            {onOlder > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">{onOlder} item(s) pinned on an older revision of this drawing - listed but not shown.</span>}
          </div>
          {drawing?.current ? (
            <PlanView
              key={drawing.current.id}
              projectId={projectId}
              documentId={drawing.id}
              revisionId={drawing.current.id}
              filename={drawing.current.originalFilename}
              pins={[...pins, ...(form?.place ? [{ id: 'new', page: form.place.page, x: form.place.x, y: form.place.y, label: '+', colour: '#0284c7', title: 'New item' }] : [])]}
              selected={selected}
              onSelect={(id) => id !== 'new' && setSelected(id)}
              onPick={
                placing
                  ? (p) => {
                      setForm((f) => (f ? { ...f, place: p } : f));
                      setPlacing(false);
                    }
                  : undefined
              }
            />
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Choose a drawing to see its pins. Items can also be added without a drawing.</p>
          )}
        </section>

        <aside className="space-y-4">
          {form && (
            <section className={`${cardCls} p-4`} aria-label={form.id ? 'Edit item' : 'New item'}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{form.id ? 'Edit item' : 'New punch item'}</h3>
                <button type="button" aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => (setForm(null), setPlacing(false))}>
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>
                  What needs doing
                  <input className={`${inputCls} mt-0.5`} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Chipped tile at the lift lobby" />
                </label>
                <label className={labelCls}>
                  Detail
                  <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={labelCls}>
                    Location
                    <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Level 2, unit 204" />
                  </label>
                  <label className={labelCls}>
                    Trade / category
                    <input className={`${inputCls} mt-0.5`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Tiling" />
                  </label>
                  <div className={labelCls}>
                    Priority
                    <Select className={`${selectCls} mt-0.5 w-full`} value={form.priority} onChange={(v) => setForm({ ...form, priority: v as Priority })} options={Object.entries(PRIORITY).map(([value, label]) => ({ value, label }))} aria-label="Priority" />
                  </div>
                  <label className={labelCls}>
                    Due
                    <DateInput className={`${inputCls} mt-0.5`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                  </label>
                </div>
                <div className={labelCls}>
                  Given to
                  <Select className={`${selectCls} mt-0.5 w-full`} value={form.assigneeId} onChange={(v) => setForm({ ...form, assigneeId: v })} options={[{ value: '', label: 'Not given to anyone yet' }, ...assignees]} aria-label="Given to" />
                </div>
                {!form.id && (
                  <p className="text-xs text-slate-500">{form.place ? `Pinned on ${drawing?.drawingNumber}, page ${form.place.page}.` : drawing ? 'Click the drawing to pin it (optional).' : 'Not pinned on a drawing.'}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="button" className={primaryBtn} disabled={!form.title.trim()} onClick={save}>
                    {form.id ? 'Save' : 'Add to the punch list'}
                  </button>
                  <button type="button" className={secondaryBtn} onClick={() => (setForm(null), setPlacing(false))}>
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          )}

          {item && !form && (
            <section className={`${cardCls} p-4`} aria-label={item.number}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-slate-500">{item.number}</p>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[item.status].tone}`}>{STATUS[item.status].label}</span>
              </div>
              {item.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{item.description}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">Given to</dt>
                <dd className="text-slate-800 dark:text-slate-100">{item.assigneeName ? `${item.assigneeName}${item.assigneeCompany ? ` (${item.assigneeCompany})` : ''}` : '—'}</dd>
                <dt className="text-slate-500">Due</dt>
                <dd className={item.overdue ? 'font-semibold text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}>
                  {fmtDay(item.dueDate)}
                  {item.overdue && ' · overdue'}
                </dd>
                <dt className="text-slate-500">Priority</dt>
                <dd className="text-slate-800 dark:text-slate-100">{PRIORITY[item.priority]}</dd>
                <dt className="text-slate-500">Where</dt>
                <dd className="text-slate-800 dark:text-slate-100">{[item.location, item.document?.drawingNumber && `${item.document.drawingNumber} rev ${item.revision?.revisionNumber}`].filter(Boolean).join(' · ') || '—'}</dd>
                <dt className="text-slate-500">Raised</dt>
                <dd className="text-slate-800 dark:text-slate-100">
                  {item.raisedBy.fullName}, {fmtDay(item.createdAt)}
                </dd>
                {item.photoCount > 0 && (
                  <>
                    <dt className="text-slate-500">Photos</dt>
                    <dd className="flex items-center gap-1 text-slate-800 dark:text-slate-100">
                      <Camera size={12} /> {item.photoCount}
                    </dd>
                  </>
                )}
              </dl>
              {item.readyNote && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Done: {item.readyNote}</p>}
              {item.rejectedNote && item.status === 'OPEN' && <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">Sent back: {item.rejectedNote}</p>}
              {item.closedAt && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">Closed by {item.closedBy?.fullName} on {fmtDay(item.closedAt)}</p>}

              {(item.can.markReady || item.can.inspect || item.can.reopen) && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <textarea className={textareaCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={item.can.inspect ? 'What is still wrong (to send it back)' : item.can.reopen ? 'Why it is being reopened' : 'What was done (optional)'} aria-label="Note" />
                  <div className="flex flex-wrap gap-2">
                    {item.can.markReady && (
                      <button type="button" className={primaryBtn} onClick={() => act(item, '/ready', { note })}>
                        <Send size={14} /> Done - ready for inspection
                      </button>
                    )}
                    {item.can.inspect && (
                      <>
                        <button type="button" className={primaryBtn} onClick={() => act(item, '/close', { note })}>
                          <CheckCircle2 size={14} /> Inspected - close
                        </button>
                        <button type="button" className={secondaryBtn} disabled={!note.trim()} onClick={() => act(item, '/send-back', { note })}>
                          <Undo2 size={14} /> Send back
                        </button>
                      </>
                    )}
                    {item.can.reopen && (
                      <button type="button" className={secondaryBtn} disabled={!note.trim()} onClick={() => act(item, '/reopen', { note })}>
                        <RotateCcw size={14} /> Reopen
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-3 flex gap-3 text-xs">
                {item.can.edit && (
                  <button
                    type="button"
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    onClick={() => setForm({ id: item.id, title: item.title, description: item.description ?? '', category: item.category ?? '', location: item.location ?? '', priority: item.priority, assigneeId: item.assigneeId ?? '', dueDate: item.dueDate?.slice(0, 10) ?? '', place: null })}
                  >
                    Edit
                  </button>
                )}
                {item.status === 'OPEN' && (
                  <button type="button" className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600" onClick={() => remove(item)}>
                    <Trash2 size={11} /> Delete
                  </button>
                )}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <CommentThread projectId={projectId} entityType="PUNCH_ITEM" entityId={item.id} />
              </div>
            </section>
          )}

          <section className={cardCls} aria-label="Punch items">
            {items === null ? (
              <p className="p-4 text-sm text-slate-400">Loading…</p>
            ) : shown.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">{items.length ? 'Nothing with that status.' : 'No punch items yet.'}</p>
            ) : (
              <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {shown.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(i.id);
                        setForm(null);
                        if (i.documentId && i.documentId !== sheetId && drawings.some((d) => d.id === i.documentId)) setSheet(i.documentId);
                      }}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selected === i.id ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}`}
                    >
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS[i.status].pin }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-800 dark:text-slate-100">
                          <span className="font-mono text-xs text-slate-500">{i.number}</span> {i.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {[STATUS[i.status].label, i.assigneeName, i.document?.drawingNumber, i.dueDate && `due ${fmtDay(i.dueDate)}`].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {i.overdue && <AlertTriangle size={13} className="mt-1 shrink-0 text-red-600" aria-label="Overdue" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
