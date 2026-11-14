'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, Download, ExternalLink, FileUp, Loader2, PenLine, Pencil, Plus, ScanText, Trash2, X } from 'lucide-react';
import { MarkupViewer } from './MarkupViewer';
import { IndexCheck } from './IndexCheck';
import { TagChip } from '@/components/files/Tags';
import type { DocTag } from '@/lib/files';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import {
  PURPOSE_OPTIONS,
  cardCls,
  fmtDay,
  inputCls,
  selectCls,
  labelCls,
  memberName,
  primaryBtn,
  secondaryBtn,
  todayIso,
  type IssuePurpose,
  type Member,
} from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

interface Revision {
  id: string;
  revisionNumber: string;
  purpose: IssuePurpose | null;
  purposeLabel: string | null;
  revisionDate: string | null;
  uploadedAt: string;
  reviewStatus: string;
  originalFilename: string;
  uploadedBy: { id: string; fullName: string };
  clientApproval: { status: string; outcome: string | null } | null;
  transmittals: { id: string; transmittalNumber: string; issuedAt: string | null }[];
}
interface Drawing {
  id: string;
  drawingNumber: string;
  title: string;
  discipline: string | null;
  originator: string | null;
  numberSource: 'TITLE_BLOCK' | 'FILE_NAME' | 'MANUAL' | null;
  clientVisible: boolean;
  current: Revision | null;
  revisions: Revision[];
  tags?: DocTag[];
}
interface TitleBlock {
  drawingNumber: string | null;
  revision: string | null;
  title: string | null;
  scale: string | null;
  date: string | null;
  purpose: IssuePurpose | null;
  purposeText: string | null;
  source: 'TITLE_BLOCK' | 'FILE_NAME' | null;
  pages: number;
  hasText: boolean;
}
interface Existing {
  id: string;
  drawingNumber: string;
  title: string;
  discipline: string | null;
  originator: string | null;
  current: { revisionNumber: string; purpose: IssuePurpose | null } | null;
  revisionNumbers: string[];
}
interface Pending {
  key: string;
  file: File;
  reading: boolean;
  titleBlock: TitleBlock | null;
  existing: Existing | null;
  number: string;
  revision: string;
  title: string;
  purpose: IssuePurpose | '';
  discipline: string;
  originator: string;
  state: 'ready' | 'uploading' | 'done' | 'error';
  error: string | null;
}
interface Planned {
  id: string;
  drawingNumber: string | null;
  title: string;
  discipline: string | null;
  stage: string;
  stageLabel: string;
  purpose: IssuePurpose;
  purposeLabel: string;
  plannedDate: string;
  responsibleId: string | null;
  responsibleName: string | null;
  notes: string | null;
  status: 'PLANNED' | 'DUE' | 'LATE' | 'ISSUED' | 'ISSUED_LATE';
  issuedAt: string | null;
  document: { id: string; drawingNumber: string | null; title: string } | null;
}
interface Programme {
  items: Planned[];
  summary: { total: number; issued: number; late: number; due: number };
}

const REVIEW: Record<string, string> = { PENDING: 'Awaiting review', APPROVED: 'Approved', REJECTED: 'Rejected', REVISION_REQUESTED: 'Revise' };
const PLAN_STATUS: Record<Planned['status'], { label: string; tone: string }> = {
  PLANNED: { label: 'Planned', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  DUE: { label: 'Due this week', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  LATE: { label: 'Late', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  ISSUED: { label: 'Issued', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  ISSUED_LATE: { label: 'Issued late', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
};
const STAGES = [
  { value: 'CONCEPT', label: 'Stage 2 · Concept & Viability' },
  { value: 'DESIGN', label: 'Stage 3 · Design Development' },
  { value: 'DOCUMENTATION_PROCUREMENT', label: 'Stage 4 · Documentation & Procurement' },
  { value: 'CONSTRUCTION', label: 'Stage 5 · Construction' },
  { value: 'CLOSEOUT', label: 'Stage 6 · Close-out' },
];
const SOURCE: Record<string, string> = { TITLE_BLOCK: 'Read from the sheet', FILE_NAME: 'From the file name', MANUAL: 'Entered by hand' };
const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** The drawing register and documentation programme (Architect 2.1, 3.1,
 * 5.2, 5.10). Drawing numbers are read from the originator's own sheet - the
 * user's decision of 26 Oct 2026 - and confirmed before upload. */
export function DrawingsPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<'register' | 'programme' | 'index'>('register');
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label="Drawings">
        {(
          [
            ['register', 'Drawing register'],
            ['programme', 'Documentation programme'],
            ['index', 'Index check'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'register' ? <Register projectId={projectId} /> : view === 'programme' ? <ProgrammePanel projectId={projectId} /> : <IndexCheck projectId={projectId} />}
    </div>
  );
}

function Register({ projectId }: { projectId: string }) {
  const { authedFetch, accessToken } = useAuth();
  const [rows, setRows] = useState<Drawing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [purpose, setPurpose] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [editing, setEditing] = useState<{ id: string; drawingNumber: string; title: string; discipline: string; originator: string } | null>(null);
  const [markup, setMarkup] = useState<{ documentId: string; revisionId: string; title: string; filename: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    authedFetch<Drawing[]>(`/projects/${projectId}/drawings`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Could not load the drawing register')));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!purpose || r.current?.purpose === purpose) && (!t || `${r.drawingNumber} ${r.title} ${r.discipline ?? ''} ${r.originator ?? ''} ${(r.tags ?? []).map((x) => x.name).join(' ')}`.toLowerCase().includes(t)));
  }, [rows, q, purpose]);

  async function choose(files: FileList | null) {
    if (!files?.length) return;
    const fresh: Pending[] = Array.from(files).map((file, n) => ({
      key: `${Date.now()}-${n}`,
      file,
      reading: true,
      titleBlock: null,
      existing: null,
      number: '',
      revision: '',
      title: '',
      purpose: '',
      discipline: '',
      originator: '',
      state: 'ready',
      error: null,
    }));
    setPending((p) => [...p, ...fresh]);
    if (fileRef.current) fileRef.current.value = '';
    for (const p of fresh) {
      const fd = new FormData();
      fd.append('file', p.file);
      try {
        const r = await authedFetch<{ titleBlock: TitleBlock; existing: Existing | null }>(`/projects/${projectId}/drawings/read`, { method: 'POST', formData: fd });
        const tb = r.titleBlock;
        setPending((all) =>
          all.map((x) =>
            x.key === p.key
              ? {
                  ...x,
                  reading: false,
                  titleBlock: tb,
                  existing: r.existing,
                  number: tb.drawingNumber ?? '',
                  revision: tb.revision ?? '',
                  title: r.existing?.title ?? tb.title ?? '',
                  purpose: tb.purpose ?? '',
                  discipline: r.existing?.discipline ?? '',
                  originator: r.existing?.originator ?? (tb.drawingNumber?.match(/\b(ARC|STR|CIV|ELE|MEC|LAN|ARCH)\b/i)?.[1]?.toUpperCase() ?? ''),
                }
              : x,
          ),
        );
      } catch (e) {
        setPending((all) => all.map((x) => (x.key === p.key ? { ...x, reading: false, state: 'error', error: err(e, 'Could not read the file') } : x)));
      }
    }
  }

  const edit = (key: string, patch: Partial<Pending>) => setPending((all) => all.map((x) => (x.key === key ? { ...x, ...patch, ...(patch.number !== undefined ? { existing: x.existing && x.existing.drawingNumber.replace(/[\s._\-/]/g, '').toUpperCase() === patch.number.replace(/[\s._\-/]/g, '').toUpperCase() ? x.existing : null } : {}) } : x)));

  async function uploadAll() {
    for (const p of pending.filter((x) => x.state === 'ready' || x.state === 'error')) {
      if (!p.number.trim() || !p.revision.trim() || (!p.existing && !p.title.trim())) {
        edit(p.key, { state: 'error', error: !p.number.trim() ? 'Enter the drawing number' : !p.revision.trim() ? 'Enter the revision' : 'Give the drawing a title' });
        continue;
      }
      edit(p.key, { state: 'uploading', error: null });
      const fd = new FormData();
      fd.append('file', p.file);
      fd.append('drawingNumber', p.number.trim());
      fd.append('revision', p.revision.trim());
      if (p.title.trim()) fd.append('title', p.title.trim());
      if (p.purpose) fd.append('purpose', p.purpose);
      if (p.discipline.trim()) fd.append('discipline', p.discipline.trim());
      if (p.originator.trim()) fd.append('originator', p.originator.trim());
      const read = p.titleBlock;
      const sameAsRead = read && read.drawingNumber && read.drawingNumber.toUpperCase() === p.number.trim().toUpperCase();
      fd.append('numberSource', sameAsRead && read.source ? read.source : 'MANUAL');
      if (read) fd.append('titleBlock', JSON.stringify(read));
      try {
        await authedFetch(`/projects/${projectId}/drawings`, { method: 'POST', formData: fd });
        edit(p.key, { state: 'done' });
      } catch (e) {
        edit(p.key, { state: 'error', error: err(e, 'Upload failed') });
      }
    }
    load();
  }

  async function view(d: Drawing, r: Revision) {
    const url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${d.id}/revisions/${r.id}/file`, accessToken);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function exportXlsx() {
    const url = await apiFetchBlobUrl(`/projects/${projectId}/drawings/export`, accessToken);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Drawing register.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function setPurpose_(d: Drawing, r: Revision, value: string) {
    try {
      const updated = await authedFetch<Drawing>(`/projects/${projectId}/drawings/${d.id}/revisions/${r.id}`, { method: 'PATCH', body: { purpose: value || null } });
      setRows((all) => all?.map((x) => (x.id === d.id ? updated : x)) ?? null);
    } catch (e) {
      setError(err(e, 'Could not save'));
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const updated = await authedFetch<Drawing>(`/projects/${projectId}/drawings/${editing.id}`, {
        method: 'PATCH',
        body: { drawingNumber: editing.drawingNumber, title: editing.title, discipline: editing.discipline || null, originator: editing.originator || null },
      });
      setRows((all) => all?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      setEditing(null);
    } catch (e) {
      setError(err(e, 'Could not save'));
    }
  }

  const waiting = pending.filter((p) => p.state !== 'done');
  // PDFs, images and CAD (DWG / DXF, drawn on the server) can be marked up.
  const canMarkUp = (r: Revision) => /\.(pdf|png|jpe?g|dwg|dxf)$/i.test(r.originalFilename);
  const busy = pending.some((p) => p.reading || p.state === 'uploading');

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Drawing register</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Drop in the sheets as issued. The drawing number, revision and purpose are read off each sheet&apos;s title block for you to check; a new revision of a number already here attaches to that drawing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} onClick={exportXlsx} disabled={!rows?.length}>
              <Download size={14} /> Export to Excel
            </button>
            <button type="button" className={primaryBtn} onClick={() => fileRef.current?.click()}>
              <FileUp size={14} /> Upload drawings
            </button>
            <input ref={fileRef} type="file" multiple accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => choose(e.target.files)} aria-label="Choose drawing files" />
          </div>
        </div>

        {waiting.length > 0 && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <ScanText size={15} /> Check what was read
              </h3>
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setPending([])}>
                Clear
              </button>
            </div>
            <ul className="space-y-3">
              {waiting.map((p) => (
                <li key={p.key} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" aria-label={p.file.name}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{p.file.name}</p>
                    <div className="flex items-center gap-2 text-xs">
                      {p.reading ? (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Loader2 size={12} className="animate-spin" /> Reading the sheet…
                        </span>
                      ) : p.titleBlock?.source === 'TITLE_BLOCK' ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Number read from the title block</span>
                      ) : p.titleBlock?.source === 'FILE_NAME' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {p.titleBlock.hasText ? 'No number on the sheet - taken from the file name' : 'Scanned sheet - number taken from the file name'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-950 dark:text-red-300">No number found - enter it</span>
                      )}
                      {!p.reading && (
                        <span className={p.existing ? 'text-sky-700 dark:text-sky-400' : 'text-slate-500'}>
                          {p.existing ? `New revision of ${p.existing.drawingNumber} (now rev ${p.existing.current?.revisionNumber ?? '—'})` : 'New drawing'}
                        </span>
                      )}
                      <button type="button" aria-label="Remove" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setPending((all) => all.filter((x) => x.key !== p.key))}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                  {!p.reading && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                      <label className={`${labelCls} lg:col-span-2`}>
                        Drawing number
                        <input className={`${inputCls} mt-0.5 font-mono`} value={p.number} onChange={(e) => edit(p.key, { number: e.target.value })} />
                      </label>
                      <label className={labelCls}>
                        Revision
                        <input className={`${inputCls} mt-0.5 font-mono`} value={p.revision} onChange={(e) => edit(p.key, { revision: e.target.value })} />
                      </label>
                      <div className={`${labelCls} lg:col-span-3`}>
                        Purpose of issue
                        <Select className={`${selectCls} mt-0.5 w-full`} value={p.purpose} onChange={(v) => edit(p.key, { purpose: v as IssuePurpose })} options={[{ value: '', label: 'Not stated' }, ...PURPOSE_OPTIONS]} aria-label="Purpose of issue" />
                      </div>
                      <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
                        Title
                        <input className={`${inputCls} mt-0.5`} value={p.title} onChange={(e) => edit(p.key, { title: e.target.value })} />
                      </label>
                      <label className={`${labelCls} lg:col-span-2`}>
                        Discipline
                        <input className={`${inputCls} mt-0.5`} placeholder="Architectural" value={p.discipline} onChange={(e) => edit(p.key, { discipline: e.target.value })} />
                      </label>
                      <label className={labelCls}>
                        Originator
                        <input className={`${inputCls} mt-0.5 uppercase`} placeholder="ARC" value={p.originator} onChange={(e) => edit(p.key, { originator: e.target.value })} />
                      </label>
                    </div>
                  )}
                  {p.titleBlock && (p.titleBlock.scale || p.titleBlock.purposeText) && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      On the sheet: {[p.titleBlock.scale && `scale ${p.titleBlock.scale}`, p.titleBlock.date && `dated ${p.titleBlock.date}`, p.titleBlock.purposeText].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {p.state === 'uploading' && <p className="mt-1.5 text-xs text-slate-500">Uploading…</p>}
                  {p.error && (
                    <p className="mt-1.5 text-xs text-red-700 dark:text-red-400" role="alert">
                      {p.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end">
              <button type="button" className={primaryBtn} disabled={busy || !waiting.length} onClick={uploadAll}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Add {waiting.length} to the register
              </button>
            </div>
          </div>
        )}
      </section>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {markup && <MarkupViewer projectId={projectId} documentId={markup.documentId} revisionId={markup.revisionId} title={markup.title} filename={markup.filename} onClose={() => setMarkup(null)} />}

      <section className={cardCls} aria-label="Drawings">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
          <input className={`${inputCls} max-w-xs`} placeholder="Search number, title, discipline" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drawings" />
          <Select className={`${selectCls} w-56`} value={purpose} onChange={setPurpose} options={[{ value: '', label: 'Any purpose' }, ...PURPOSE_OPTIONS]} aria-label="Filter by purpose" />
          <span className="ml-auto text-xs text-slate-500">{rows ? `${shown.length} of ${rows.length} drawings` : ''}</span>
        </div>
        {rows === null ? (
          <p className="p-4 text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No drawings yet. Upload the first sheets above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Rev</th>
                  <th className="px-3 py-2">Purpose of issue</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2">Review</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((d) => {
                  const expanded = open === d.id;
                  return (
                    <Fragment key={d.id}>
                      <tr className="align-top">
                        <td className="px-3 py-2.5">
                          <button type="button" aria-expanded={expanded} aria-label={`Revisions of ${d.drawingNumber}`} onClick={() => setOpen(expanded ? null : d.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {d.drawingNumber}
                          {d.numberSource && <span className="mt-0.5 block font-sans text-[10px] font-normal text-slate-400">{SOURCE[d.numberSource]}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 dark:text-slate-100">
                          {d.title}
                          <span className="block text-xs text-slate-500">{[d.discipline, d.originator].filter(Boolean).join(' · ')}</span>
                          {!!d.tags?.length && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {d.tags.map((t) => (
                                <TagChip key={t.id} tag={t} />
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">{d.current?.revisionNumber}</td>
                        <td className="px-3 py-2.5 text-xs">{d.current?.purposeLabel ?? <span className="text-slate-400">Not stated</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{fmtDay(d.current?.revisionDate ?? d.current?.uploadedAt)}</td>
                        <td className="px-3 py-2.5 text-xs">{d.current ? REVIEW[d.current.reviewStatus] ?? d.current.reviewStatus : '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            {d.current && (
                              <button type="button" onClick={() => view(d, d.current!)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                                <ExternalLink size={12} /> View
                              </button>
                            )}
                            {d.current && canMarkUp(d.current) && (
                              <button
                                type="button"
                                onClick={() => setMarkup({ documentId: d.id, revisionId: d.current!.id, title: `${d.drawingNumber} rev ${d.current!.revisionNumber} · ${d.title}`, filename: d.current!.originalFilename })}
                                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              >
                                <PenLine size={12} /> Mark up
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Edit ${d.drawingNumber}`}
                              onClick={() => setEditing({ id: d.id, drawingNumber: d.drawingNumber, title: d.title, discipline: d.discipline ?? '', originator: d.originator ?? '' })}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editing?.id === d.id && (
                        <tr>
                          <td />
                          <td colSpan={7} className="px-3 pb-3">
                            <div className="grid gap-2 sm:grid-cols-5">
                              <input className={`${inputCls} font-mono`} aria-label="Drawing number" value={editing.drawingNumber} onChange={(e) => setEditing({ ...editing, drawingNumber: e.target.value })} />
                              <input className={`${inputCls} sm:col-span-2`} aria-label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                              <input className={inputCls} aria-label="Discipline" placeholder="Discipline" value={editing.discipline} onChange={(e) => setEditing({ ...editing, discipline: e.target.value })} />
                              <input className={inputCls} aria-label="Originator" placeholder="Originator" value={editing.originator} onChange={(e) => setEditing({ ...editing, originator: e.target.value })} />
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button type="button" className={primaryBtn} onClick={saveEdit}>
                                Save
                              </button>
                              <button type="button" className={secondaryBtn} onClick={() => setEditing(null)}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {expanded && (
                        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                          <td />
                          <td colSpan={7} className="px-3 pb-3 pt-1">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-slate-500">
                                  <th className="py-1 pr-3">Rev</th>
                                  <th className="py-1 pr-3">Purpose</th>
                                  <th className="py-1 pr-3">Uploaded</th>
                                  <th className="py-1 pr-3">By</th>
                                  <th className="py-1 pr-3">Transmittals</th>
                                  <th className="py-1 pr-3">Client</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {d.revisions.map((r) => (
                                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="py-1.5 pr-3 font-mono">{r.revisionNumber}</td>
                                    <td className="w-56 py-1.5 pr-3">
                                      <Select className={`${selectCls} h-8 w-full text-xs`} value={r.purpose ?? ''} onChange={(v) => setPurpose_(d, r, v)} options={[{ value: '', label: 'Not stated' }, ...PURPOSE_OPTIONS]} aria-label={`Purpose of rev ${r.revisionNumber}`} />
                                    </td>
                                    <td className="py-1.5 pr-3">{fmtDay(r.uploadedAt)}</td>
                                    <td className="py-1.5 pr-3">{r.uploadedBy.fullName}</td>
                                    <td className="py-1.5 pr-3">{r.transmittals.map((t) => t.transmittalNumber).join(', ') || '—'}</td>
                                    <td className="py-1.5 pr-3">{r.clientApproval ? (r.clientApproval.outcome ?? r.clientApproval.status).replace(/_/g, ' ').toLowerCase() : '—'}</td>
                                    <td className="py-1.5 text-right">
                                      <button type="button" onClick={() => view(d, r)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                                        View
                                      </button>
                                      {canMarkUp(r) && (
                                        <button type="button" onClick={() => setMarkup({ documentId: d.id, revisionId: r.id, title: `${d.drawingNumber} rev ${r.revisionNumber} · ${d.title}`, filename: r.originalFilename })} className="ml-3 font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                                          Mark up
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const emptyPlan = () => ({ drawingNumber: '', title: '', discipline: '', stage: 'DESIGN', purpose: 'FOR_COMMENT' as IssuePurpose, plannedDate: todayIso(), responsibleId: '', notes: '' });

function ProgrammePanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<Programme | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ReturnType<typeof emptyPlan> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Programme>(`/projects/${projectId}/drawing-programme`)
      .then(setData)
      .catch((e) => setError(err(e, 'Could not load the programme')));
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  async function save() {
    if (!form) return;
    setError(null);
    const body = { ...form, drawingNumber: form.drawingNumber || null, discipline: form.discipline || null, responsibleId: form.responsibleId || null, notes: form.notes || null };
    try {
      setData(await authedFetch<Programme>(editId ? `/projects/${projectId}/drawing-programme/${editId}` : `/projects/${projectId}/drawing-programme`, { method: editId ? 'PUT' : 'POST', body }));
      setForm(null);
      setEditId(null);
    } catch (e) {
      setError(err(e, 'Could not save'));
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Take this drawing off the programme?')) return;
    try {
      setData(await authedFetch<Programme>(`/projects/${projectId}/drawing-programme/${id}`, { method: 'DELETE' }));
    } catch (e) {
      setError(err(e, 'Could not remove'));
    }
  }

  const team = members.filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: `${memberName(m)}${m.externalCompany ? ` · ${m.externalCompany}` : ''}` }));

  return (
    <section className={`${cardCls} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Documentation programme</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            The drawings the team has agreed to produce, the purpose each is due for, and when. A planned drawing ticks off when a sheet with its number is uploaded for that purpose.
          </p>
        </div>
        {!form && (
          <button
            type="button"
            className={primaryBtn}
            onClick={() => {
              setEditId(null);
              setForm(emptyPlan());
            }}
          >
            <Plus size={14} /> Plan a drawing
          </button>
        )}
      </div>

      {data && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{data.summary.total} planned</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{data.summary.issued} issued</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{data.summary.due} due this week</span>
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 dark:bg-red-950 dark:text-red-300">{data.summary.late} late</span>
        </div>
      )}

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {form && (
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
          <label className={labelCls}>
            Drawing number (if known)
            <input className={`${inputCls} mt-0.5 font-mono`} value={form.drawingNumber} onChange={(e) => setForm({ ...form, drawingNumber: e.target.value })} />
          </label>
          <label className={`${labelCls} lg:col-span-2`}>
            Title
            <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className={labelCls}>
            Discipline
            <input className={`${inputCls} mt-0.5`} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} />
          </label>
          <div className={labelCls}>
            Stage
            <Select className={`${selectCls} mt-0.5 w-full`} value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} options={STAGES} aria-label="Stage" />
          </div>
          <div className={labelCls}>
            Purpose
            <Select className={`${selectCls} mt-0.5 w-full`} value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v as IssuePurpose })} options={PURPOSE_OPTIONS} aria-label="Purpose" />
          </div>
          <label className={labelCls}>
            Planned issue date
            <DateInput className={`${inputCls} mt-0.5`} value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} />
          </label>
          <div className={labelCls}>
            Responsible
            <Select className={`${selectCls} mt-0.5 w-full`} value={form.responsibleId} onChange={(v) => setForm({ ...form, responsibleId: v })} options={[{ value: '', label: '—' }, ...team]} aria-label="Responsible" />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button type="button" className={primaryBtn} onClick={save} disabled={!form.title.trim()}>
              {editId ? 'Save' : 'Add to programme'}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                setForm(null);
                setEditId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {data === null ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : data.items.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">Nothing planned yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Drawing</th>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2">Purpose</th>
                <th className="px-2 py-2">Planned</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Responsible</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-2 py-2">
                    <span className="font-mono text-xs text-slate-500">{p.drawingNumber ?? 'No number yet'}</span>
                    <span className="block text-slate-800 dark:text-slate-100">{p.title}</span>
                  </td>
                  <td className="px-2 py-2 text-xs">{p.stageLabel}</td>
                  <td className="px-2 py-2 text-xs">{p.purposeLabel}</td>
                  <td className="px-2 py-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={12} className="text-slate-400" />
                      {fmtDay(p.plannedDate)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${PLAN_STATUS[p.status].tone}`}>{PLAN_STATUS[p.status].label}</span>
                    {p.issuedAt && <span className="mt-0.5 block text-[11px] text-slate-500">{fmtDay(p.issuedAt)}</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">{p.responsibleName ?? '—'}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Edit ${p.title}`}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        setEditId(p.id);
                        setForm({
                          drawingNumber: p.drawingNumber ?? '',
                          title: p.title,
                          discipline: p.discipline ?? '',
                          stage: p.stage,
                          purpose: p.purpose,
                          plannedDate: p.plannedDate.slice(0, 10),
                          responsibleId: p.responsibleId ?? '',
                          notes: p.notes ?? '',
                        });
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button type="button" aria-label={`Remove ${p.title}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => remove(p.id)}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
