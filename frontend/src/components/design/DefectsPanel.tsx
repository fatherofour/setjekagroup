'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Camera, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls, todayIso } from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

type List = 'PRACTICAL_COMPLETION' | 'DEFECTS_LIABILITY' | 'LATENT';
type Status = 'REPORTED' | 'OPEN' | 'RECTIFIED' | 'VERIFIED' | 'DECLINED';
type Stage = 'PRACTICAL' | 'WORKS' | 'FINAL';

interface ContractPos {
  id: string;
  title: string;
  contractor: { name: string };
  completion: string;
  completionDate: string | null;
  practicalCompletionAt: string | null;
  worksCompletionAt: string | null;
  defectsPeriodDays: number | null;
  defectsPeriodEndsAt: string | null;
  finalCompletionAt: string | null;
  periodDays: number;
  stage: 'CONSTRUCTION' | 'PRACTICAL' | 'DEFECTS_PERIOD' | 'PERIOD_ENDED' | 'FINAL';
  counts: { open: number; rectified: number; reported: number; verified: number };
  retention: 'NONE' | 'HALF' | 'ALL';
  blockers: { works: string | null; final: string | null };
  can: { certifyPractical: boolean; certifyWorks: boolean; certifyFinal: boolean; setPeriod: boolean; listDefects: boolean; report: boolean };
}

interface Defect {
  id: string;
  number: string;
  list: List;
  title: string;
  description: string | null;
  location: string | null;
  status: Status;
  dueDate: string | null;
  rectifiedNote: string | null;
  verifiedAt: string | null;
  declineReason: string | null;
  reopened: number;
  overdue: boolean;
  photoCount: number;
  createdAt: string;
  contract: { id: string; title: string; contractor: { name: string } };
  raisedBy: { id: string; fullName: string };
  verifiedBy: { fullName: string } | null;
  history: { status: Status; at: string; name: string; comment: string | null }[];
  can: { issue: boolean; decline: boolean; rectify: boolean; verify: boolean; reopen: boolean; addPhotos: boolean };
}

const LIST: Record<List, string> = { PRACTICAL_COMPLETION: 'Practical completion list', DEFECTS_LIABILITY: 'Defects liability period', LATENT: 'Latent defect' };
const STATUS: Record<Status, { label: string; tone: string }> = {
  REPORTED: { label: 'Reported by the client', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  OPEN: { label: 'With the contractor', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  RECTIFIED: { label: 'Put right, to verify', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  VERIFIED: { label: 'Verified', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  DECLINED: { label: 'Not a defect', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const RETENTION: Record<ContractPos['retention'], string> = {
  NONE: 'Retention is held in full until practical completion.',
  HALF: 'Half the retention can be released; the rest on the final valuation, after final completion.',
  ALL: 'All the retention is released on the final valuation.',
};
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
/** Where a new defect goes on this contract right now. */
const listNow = (k: ContractPos): List => (k.finalCompletionAt ? 'LATENT' : k.worksCompletionAt ? 'DEFECTS_LIABILITY' : 'PRACTICAL_COMPLETION');

function Step({ done, label, date, children }: { done: boolean; label: string; date: string | null; children?: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${done ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 dark:border-slate-600'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
          {label}
          {date && <span className="font-normal text-slate-500"> · {fmtDay(date)}</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

function CertifyButton({ label, onCertify }: { label: string; onCertify: (date: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        {label}
      </button>
    );
  return (
    <form
      className="mt-1 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onCertify(date);
        setBusy(false);
        setOpen(false);
      }}
    >
      <label className={labelCls}>
        Date
        <DateInput aria-label={`${label}: date`} className={`${inputCls} mt-0.5 w-40`} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button type="submit" disabled={busy || !date} className={primaryBtn}>
        Certify
      </button>
      <button type="button" onClick={() => setOpen(false)} className={secondaryBtn}>
        Cancel
      </button>
    </form>
  );
}

function ContractCard({ projectId, k, onChanged }: { projectId: string; k: ContractPos; onChanged: (x: ContractPos) => void }) {
  const { authedFetch } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [editPeriod, setEditPeriod] = useState(false);
  const [period, setPeriod] = useState(String(k.defectsPeriodDays ?? k.periodDays));
  async function certify(stage: Stage, date: string) {
    setError(null);
    try {
      onChanged(await authedFetch<ContractPos>(`/projects/${projectId}/defects/contracts/${k.id}/certify`, { method: 'POST', body: { stage, date } }));
    } catch (e) {
      setError(err(e, 'Could not certify.'));
    }
  }
  return (
    <section className={`${cardCls} p-3`} aria-label={`${k.title} completion`}>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{k.title}</p>
      <p className="text-xs text-slate-500">
        {k.contractor.name}
        {k.completionDate && ` · ${k.completion.toLowerCase()} due ${fmtDay(k.completionDate)}`}
      </p>
      {error && <p className={`mt-2 ${errBox}`}>{error}</p>}
      <ol className="mt-3 space-y-2">
        <Step done={Boolean(k.practicalCompletionAt)} label="Practical completion" date={k.practicalCompletionAt}>
          {k.can.certifyPractical && <CertifyButton label="Certify practical completion" onCertify={(d) => certify('PRACTICAL', d)} />}
        </Step>
        <Step done={Boolean(k.worksCompletionAt)} label="Works completion: practical completion list cleared" date={k.worksCompletionAt}>
          {k.practicalCompletionAt && !k.worksCompletionAt && k.blockers.works && <p className="text-[11px] text-amber-700 dark:text-amber-400">{k.blockers.works}</p>}
          {k.can.certifyWorks && !k.blockers.works && <CertifyButton label="Certify works completion" onCertify={(d) => certify('WORKS', d)} />}
        </Step>
        <Step done={k.stage === 'PERIOD_ENDED' || k.stage === 'FINAL'} label={`Defects liability period: ${k.defectsPeriodDays ?? k.periodDays} days`} date={k.defectsPeriodEndsAt}>
          {k.can.setPeriod &&
            (editPeriod ? (
              <form
                className="mt-1 flex items-end gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    onChanged(await authedFetch<ContractPos>(`/projects/${projectId}/defects/contracts/${k.id}/period`, { method: 'PUT', body: { defectsPeriodDays: period === '' ? null : Number(period) } }));
                    setEditPeriod(false);
                  } catch (e2) {
                    setError(err(e2, 'Could not save.'));
                  }
                }}
              >
                <label className={labelCls}>
                  Days
                  <input type="number" min={0} className={`${inputCls} mt-0.5 w-24`} value={period} onChange={(e) => setPeriod(e.target.value)} />
                </label>
                <button type="submit" className={primaryBtn}>
                  Save
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditPeriod(true)} className="text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Change the period
              </button>
            ))}
        </Step>
        <Step done={Boolean(k.finalCompletionAt)} label="Final completion" date={k.finalCompletionAt}>
          {k.worksCompletionAt && !k.finalCompletionAt && k.blockers.final && <p className="text-[11px] text-amber-700 dark:text-amber-400">{k.blockers.final}</p>}
          {k.can.certifyFinal && !k.blockers.final && <CertifyButton label="Certify final completion" onCertify={(d) => certify('FINAL', d)} />}
        </Step>
      </ol>
      <p className="mt-3 text-[11px] text-slate-500">
        {k.counts.open} open · {k.counts.rectified} to verify · {k.counts.verified} verified{k.counts.reported > 0 && ` · ${k.counts.reported} reported by the client`}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{RETENTION[k.retention]}</p>
    </section>
  );
}

function Detail({ projectId, id, onBack, onChanged }: { projectId: string; id: string; onBack: () => void; onChanged: () => void }) {
  const { authedFetch, accessToken } = useAuth();
  const [d, setD] = useState<Defect | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ id: string; url: string }[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const base = `/projects/${projectId}/defects/${id}`;

  useEffect(() => {
    authedFetch<Defect>(base)
      .then(setD)
      .catch((e) => setError(err(e, 'Failed to load the defect.')));
  }, [authedFetch, base]);

  useEffect(() => {
    if (!d) return;
    let cancelled = false;
    const made: string[] = [];
    authedFetch<{ id: string }[]>(`/projects/${projectId}/site-photos?contractDefectId=${d.id}`)
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
  }, [authedFetch, accessToken, projectId, d]);

  async function act(path: string, body: object = {}) {
    setError(null);
    setBusy(true);
    try {
      setD(await authedFetch<Defect>(`${base}/${path}`, { method: 'POST', body }));
      setComment('');
      onChanged();
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !d) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('contractDefectId', d.id);
      fd.append('caption', `${d.number} ${d.title}`);
      await authedFetch(`/projects/${projectId}/site-photos`, { method: 'POST', formData: fd }).catch((e) => setError(err(e, 'A photo did not upload')));
    }
    if (photoRef.current) photoRef.current.value = '';
    await authedFetch<Defect>(base)
      .then(setD)
      .catch(() => undefined);
    setBusy(false);
  }

  if (!d) return <p className={error ? errBox : 'text-sm text-slate-400'}>{error ?? 'Loading…'}</p>;
  const needs = [d.can.decline && 'decline it', d.can.reopen && 'send it back'].filter(Boolean) as string[];
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All defects
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {d.number} · {d.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {LIST[d.list]} · {d.contract.title} ({d.contract.contractor.name})
            {d.location && ` · ${d.location}`} · raised by {d.raisedBy.fullName} on {fmtDay(d.createdAt)}
            {d.dueDate && ` · put right by ${fmtDay(d.dueDate)}`}
            {d.reopened > 0 && ` · sent back ${d.reopened}×`}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {d.overdue && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>
        </span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      {d.description && <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{d.description}</p>}
      {d.rectifiedNote && <p className="mt-2 text-xs text-slate-500">The contractor: {d.rectifiedNote}</p>}
      {d.verifiedBy && <p className="mt-1 text-xs text-slate-500">Verified by {d.verifiedBy.fullName} on {fmtDay(d.verifiedAt)}</p>}
      {d.declineReason && <p className="mt-1 text-xs text-slate-500">Not taken up: {d.declineReason}</p>}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos ({d.photoCount})</h4>
          {d.can.addPhotos && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => photoRef.current?.click()}>
                <Camera size={14} /> Add photos
              </button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} aria-label="Add photos of the defect" />
            </>
          )}
        </div>
        {thumbs.length > 0 && (
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {thumbs.map((t) => (
              <li key={t.id} className="aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.url} alt={`${d.number} photo`} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {(d.can.issue || d.can.decline || d.can.rectify || d.can.verify || d.can.reopen) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label className={labelCls}>
            {needs.length ? `Comment (needed to ${needs.join(' or ')})` : d.can.rectify ? 'What was done (optional)' : 'Comment (optional)'}
            <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {d.can.issue && (
              <button type="button" disabled={busy} onClick={() => act('issue', { comment: comment || undefined })} className={primaryBtn}>
                Issue to the contractor
              </button>
            )}
            {d.can.decline && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('decline', { reason: comment })} className={secondaryBtn}>
                Not a defect
              </button>
            )}
            {d.can.rectify && (
              <button type="button" disabled={busy} onClick={() => act('rectify', { comment: comment || undefined })} className={primaryBtn}>
                Put right, ready to verify
              </button>
            )}
            {d.can.verify && (
              <button type="button" disabled={busy} onClick={() => act('verify', { comment: comment || undefined })} className={primaryBtn}>
                Verified on site
              </button>
            )}
            {d.can.reopen && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('reopen', { reason: comment })} className={secondaryBtn}>
                Not put right yet
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {d.history.map((h, i) => (
          <li key={i}>
            {fmtDayTime(h.at)} · {h.name} · {STATUS[h.status]?.label ?? h.status}
            {h.comment && ` — ${h.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="CONTRACT_DEFECT" entityId={d.id} />
      </div>
    </div>
  );
}

/** Completion certificates and the defects liability period (the user's
 * choice, 2026-11-03). */
export function DefectsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [contracts, setContracts] = useState<ContractPos[] | null>(null);
  const [defects, setDefects] = useState<Defect[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('defect'));
  const [contractFilter, setContractFilter] = useState('');
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [adding, setAdding] = useState(false);
  const blank = { contractId: '', list: '' as List | '', title: '', location: '', description: '', dueDate: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Defect[]>(`/projects/${projectId}/defects`)
      .then(setDefects)
      .catch((e) => setError(err(e, 'Failed to load the defects.')));
    authedFetch<ContractPos[]>(`/projects/${projectId}/defects/contracts`)
      .then(setContracts)
      .catch((e) => setError(err(e, 'Failed to load the contracts.')));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  // A completion alert links to its contract: show that contract's defects.
  const linkedContract = selectedId && contracts?.some((k) => k.id === selectedId) ? selectedId : null;
  const openId = linkedContract ? null : selectedId;
  const contractShown = contractFilter || linkedContract || '';
  if (openId) return <Detail projectId={projectId} id={openId} onBack={() => setSelectedId(null)} onChanged={load} />;

  const canList = Boolean(contracts?.some((k) => k.can.listDefects));
  const canReport = Boolean(contracts?.some((k) => k.can.report));
  const chosen = contracts?.find((k) => k.id === (form.contractId || contracts?.[0]?.id));
  const list = form.list || (chosen ? listNow(chosen) : 'PRACTICAL_COMPLETION');
  const shown = (defects ?? []).filter((d) => (!contractShown || d.contract.id === contractShown) && (filter === 'all' || ['REPORTED', 'OPEN', 'RECTIFIED'].includes(d.status)));

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const d = await authedFetch<Defect>(`/projects/${projectId}/defects`, {
        method: 'POST',
        body: { contractId: chosen?.id, list, title: form.title.trim(), location: form.location.trim() || undefined, description: form.description.trim() || undefined, dueDate: form.dueDate || undefined },
      });
      setAdding(false);
      setForm(blank);
      load();
      setSelectedId(d.id);
    } catch (e2) {
      setError(err(e2, 'Could not add the defect.'));
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <BadgeCheck size={16} className="text-emerald-700 dark:text-emerald-400" /> Completion &amp; defects
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {canReport
                ? 'Each contract from practical completion to final completion. Report anything not right after handover; Setjeka issues it to the contractor and checks it is put right.'
                : 'Certify practical completion, clear the practical completion list for works completion, then list defects through the defects period. Final completion follows once the period ends and every defect is verified, and the retention is released with it.'}
            </p>
          </div>
          {(canList || canReport) && !adding && contracts && contracts.length > 0 && (
            <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
              <Plus size={14} /> {canReport ? 'Report a defect' : 'List a defect'}
            </button>
          )}
        </div>

        {adding && contracts && (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            {contracts.length > 1 && (
              <div className={`${labelCls} sm:col-span-2`}>
                Contract
                <Select aria-label="Contract" className={`${selectCls} mt-0.5 w-full`} value={form.contractId || contracts[0].id} onChange={(v) => setForm({ ...form, contractId: v, list: '' })} options={contracts.map((k) => ({ value: k.id, label: `${k.title} · ${k.contractor.name}` }))} />
              </div>
            )}
            {canList ? (
              <div className={`${labelCls} sm:col-span-2`}>
                List
                <Select aria-label="List" className={`${selectCls} mt-0.5 w-full`} value={list} onChange={(v) => setForm({ ...form, list: v as List })} options={(Object.keys(LIST) as List[]).map((l) => ({ value: l, label: LIST[l] }))} />
              </div>
            ) : (
              <p className="text-xs text-slate-500 sm:col-span-2">This will go on the {LIST[list].toLowerCase()}.</p>
            )}
            <label className={`${labelCls} sm:col-span-3`}>
              The defect
              <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Cracked floor tiles at the entrance" />
            </label>
            <label className={labelCls}>
              Where
              <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <label className={`${labelCls} ${canList ? 'sm:col-span-3' : 'sm:col-span-4'}`}>
              Details (optional)
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            {canList && (
              <label className={labelCls}>
                Put right by
                <DateInput className={`${inputCls} mt-0.5`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
            )}
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim()} className={primaryBtn}>
                {canReport ? 'Report it' : 'List it'}
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
            {canList && <p className="text-xs text-slate-500 sm:col-span-4">Left empty, the contractor has 14 days to put it right.</p>}
          </form>
        )}
      </div>

      {contracts === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>No contracts on this project yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contracts.map((k) => (
            <ContractCard key={k.id} projectId={projectId} k={k} onChanged={(x) => setContracts((all) => (all ?? []).map((y) => (y.id === x.id ? x : y)))} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Defects</h3>
        <div className="flex flex-wrap gap-2">
          {contracts && contracts.length > 1 && <Select aria-label="Contract filter" className={`${selectCls} h-9 w-48`} value={contractShown}
              onChange={(v) => {
                setContractFilter(v);
                setSelectedId(null);
              }}
              options={[{ value: '', label: 'All contracts' }, ...contracts.map((k) => ({ value: k.id, label: k.title }))]} />}
          <Select aria-label="Show" className={`${selectCls} h-9 w-32`} value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
        </div>
      </div>
      {defects === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'open' ? 'No open defects.' : 'No defects listed.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setSelectedId(d.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{d.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{d.title}</span>
                  <span className="block text-xs text-slate-500">
                    {LIST[d.list]} · {d.contract.contractor.name}
                    {d.location && ` · ${d.location}`}
                    {d.dueDate && ['OPEN', 'REPORTED'].includes(d.status) && ` · by ${fmtDay(d.dueDate)}`}
                  </span>
                </span>
                {d.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
