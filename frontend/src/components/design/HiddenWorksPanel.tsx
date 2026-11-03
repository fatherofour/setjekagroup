'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, EyeOff, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from '@/lib/architect';

type Status = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COVERED' | 'COVERED_UNAPPROVED' | 'CANCELLED';

interface HiddenWork {
  id: string;
  number: string;
  title: string;
  trade: string | null;
  location: string | null;
  status: Status;
  readyAt: string | null;
  asBuilt: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  coveredAt: string | null;
  createdAt: string;
  photoCount: number;
  contractor: { id: string; name: string } | null;
  scheduleActivity: { id: string; name: string } | null;
  inspector: { id: string; externalName: string | null; user: { fullName: string } | null } | null;
  requestedBy: { id: string; fullName: string };
  decidedBy: { fullName: string } | null;
  ncrs: { id: string; number: string; status: string }[];
  history: { status: Status; at: string; name: string; comment: string | null }[];
  can: { approve: boolean; reject: boolean; rerequest: boolean; cover: boolean; coveredUnapproved: boolean; raiseNcr: boolean; cancel: boolean; addPhotos: boolean };
}

interface Options {
  members: { id: string; role: string; name: string; firm: string | null }[];
  activities: { id: string; name: string }[];
  you: { contractor: boolean; quality: boolean; site: boolean; memberIds: string[] };
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  REQUESTED: { label: 'Waiting for sign-off', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  APPROVED: { label: 'Approved, may be covered', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  REJECTED: { label: 'Not to be covered yet', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  COVERED: { label: 'Covered', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  COVERED_UNAPPROVED: { label: 'Covered before sign-off', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const TRADES = ['Drainage', 'Water reticulation', 'Reinforcement', 'Foundations', 'Waterproofing', 'Electrical', 'Plumbing', 'Mechanical', 'Insulation', 'Other'];
const INSPECTOR_ROLES = ['ARCHITECT', 'ARCHITECT_ENGINEER', 'CIVIL_ENGINEER', 'STRUCTURAL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER', 'QA_QC_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'];
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';

function Detail({ projectId, h, onBack, onChanged }: { projectId: string; h: HiddenWork; onBack: () => void; onChanged: (x: HiddenWork) => void }) {
  const { authedFetch, accessToken } = useAuth();
  const [comment, setComment] = useState('');
  const [asBuilt, setAsBuilt] = useState(h.asBuilt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ id: string; url: string; caption: string | null }[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const base = `/projects/${projectId}/hidden-works/${h.id}`;

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    authedFetch<{ id: string; caption: string | null }[]>(`/projects/${projectId}/site-photos?hiddenWorkId=${h.id}`)
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
  }, [authedFetch, accessToken, projectId, h.id, h.photoCount]);

  async function act(path: string, body: object = {}) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await authedFetch<HiddenWork>(`${base}/${path}`, { method: 'POST', body }));
      setComment('');
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('hiddenWorkId', h.id);
      fd.append('caption', `${h.number} ${h.title}`);
      await authedFetch(`/projects/${projectId}/site-photos`, { method: 'POST', formData: fd }).catch((e) => setError(err(e, 'A photo did not upload')));
    }
    if (photoRef.current) photoRef.current.value = '';
    await authedFetch<HiddenWork>(base)
      .then(onChanged)
      .catch(() => undefined);
    setBusy(false);
  }

  const reasonFor = [h.can.reject && 'turn it back', h.can.coveredUnapproved && 'record it covered', h.can.cancel && 'cancel'].filter(Boolean) as string[];
  const needsReason = reasonFor.length > 0;
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All hidden works
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {h.number} · {h.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {h.trade ?? 'Hidden work'}
            {h.location && ` · ${h.location}`}
            {h.contractor && ` · ${h.contractor.name}`}
            {h.scheduleActivity && ` · activity "${h.scheduleActivity.name}"`} · asked for by {h.requestedBy.fullName} on {fmtDay(h.createdAt)}
            {h.inspector && ` · inspector ${h.inspector.user?.fullName ?? h.inspector.externalName}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[h.status].tone}`}>{STATUS[h.status].label}</span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      {h.readyAt && h.status === 'REQUESTED' && <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">Ready to inspect: {fmtDayTime(h.readyAt)}</p>}
      {h.asBuilt && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
          <p className="text-xs font-medium text-slate-500">What is covered (as built)</p>
          <p className="whitespace-pre-line text-slate-800 dark:text-slate-100">{h.asBuilt}</p>
        </div>
      )}
      {h.decidedBy && h.decisionComment && (
        <p className="mt-2 text-xs text-slate-500">
          {h.decidedBy.fullName}, {fmtDay(h.decidedAt)}: {h.decisionComment}
        </p>
      )}
      {h.coveredAt && <p className="mt-1 text-xs text-slate-500">Covered {fmtDay(h.coveredAt)}</p>}
      {h.ncrs.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          NCR{' '}
          {h.ncrs.map((n) => (
            <Link key={n.id} href={`/projects/${projectId}?tab=ncrs&ncr=${n.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              {n.number}
            </Link>
          ))}
        </p>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos ({h.photoCount})</h4>
          {h.can.addPhotos && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => photoRef.current?.click()}>
                <Camera size={14} /> Add photos
              </button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} aria-label="Add photos of the hidden work" />
            </>
          )}
        </div>
        {h.photoCount === 0 && h.status === 'REQUESTED' && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Photos of the work are needed before it can be approved: they are the record of what is hidden.</p>}
        {thumbs.length > 0 && (
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {thumbs.map((t) => (
              <li key={t.id} className="aspect-square overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.url} alt={t.caption ?? 'Hidden work photo'} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {(h.can.approve || h.can.reject || h.can.rerequest || h.can.cover || h.can.coveredUnapproved || h.can.raiseNcr || h.can.cancel) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          {h.can.approve && (
            <label className={labelCls}>
              What is covered: sizes, depths, positions (optional)
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={asBuilt} onChange={(e) => setAsBuilt(e.target.value)} />
            </label>
          )}
          {!h.can.raiseNcr && (
            <label className={labelCls}>
              {needsReason ? `Comment (needed to ${reasonFor.join(reasonFor.length > 2 ? ', ' : ' or ').replace(/, (?=[^,]*$)/, ', or ')})` : 'Comment (optional)'}
              <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {h.can.approve && (
              <button type="button" disabled={busy || h.photoCount === 0} onClick={() => act('approve', { comment: comment || undefined, asBuilt: asBuilt.trim() || undefined })} className={primaryBtn}>
                Approve, may be covered
              </button>
            )}
            {h.can.reject && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('reject', { reason: comment })} className={secondaryBtn}>
                Not to be covered yet
              </button>
            )}
            {h.can.rerequest && (
              <button type="button" disabled={busy} onClick={() => act('rerequest', { comment: comment || undefined })} className={primaryBtn}>
                Put right, inspect again
              </button>
            )}
            {h.can.cover && (
              <button type="button" disabled={busy} onClick={() => act('cover', { comment: comment || undefined })} className={primaryBtn}>
                Mark covered
              </button>
            )}
            {h.can.coveredUnapproved && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('covered-unapproved', { reason: comment })} className={secondaryBtn}>
                Found covered before sign-off
              </button>
            )}
            {h.can.raiseNcr && (
              <Link href={`/projects/${projectId}?tab=ncrs&fromHiddenWork=${h.id}`} className={primaryBtn}>
                Raise an NCR
              </Link>
            )}
            {h.can.cancel && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => confirm(`Cancel ${h.number}?`) && act('cancel', { reason: comment })} className={secondaryBtn}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {h.history.map((e, i) => (
          <li key={i}>
            {fmtDayTime(e.at)} · {e.name} · {STATUS[e.status]?.label ?? e.status}
            {e.comment && ` — ${e.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="HIDDEN_WORK" entityId={h.id} />
      </div>
    </div>
  );
}

/** Hidden-works sign-off (the user's choice, 2026-11-03): work is inspected
 * and photographed before it is covered, and the register records what lies
 * where. */
export function HiddenWorksPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [rows, setRows] = useState<HiddenWork[] | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('work'));
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [trade, setTrade] = useState('');
  const blank = { title: '', trade: TRADES[0], location: '', inspectorId: '', scheduleActivityId: '', readyAt: '', asBuilt: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<HiddenWork[]>(`/projects/${projectId}/hidden-works`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Failed to load the hidden works.')));
    authedFetch<Options>(`/projects/${projectId}/interfaces/options`)
      .then(setOpts)
      .catch(() => setOpts({ members: [], activities: [], you: { contractor: false, quality: false, site: false, memberIds: [] } }));
  }, [authedFetch, projectId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const h = await authedFetch<HiddenWork>(`/projects/${projectId}/hidden-works`, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          trade: form.trade,
          location: form.location.trim() || undefined,
          inspectorId: form.inspectorId || undefined,
          scheduleActivityId: form.scheduleActivityId || undefined,
          readyAt: form.readyAt ? new Date(form.readyAt).toISOString() : undefined,
          asBuilt: form.asBuilt.trim() || undefined,
        },
      });
      setRows((r) => [h, ...(r ?? [])]);
      setAdding(false);
      setForm(blank);
      setSelectedId(h.id);
    } catch (e2) {
      setError(err(e2, 'Could not ask for sign-off.'));
    }
  }

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  if (selected) return <Detail projectId={projectId} h={selected} onBack={() => setSelectedId(null)} onChanged={(x) => setRows((r) => (r ?? []).map((y) => (y.id === x.id ? x : y)))} />;

  const inspectors = (opts?.members ?? []).filter((m) => INSPECTOR_ROLES.includes(m.role));
  const shown = (rows ?? []).filter((r) => (filter === 'all' || ['REQUESTED', 'APPROVED', 'REJECTED', 'COVERED_UNAPPROVED'].includes(r.status)) && (!trade || r.trade === trade));
  const isContractor = Boolean(opts?.you.contractor);
  const flagged = (rows ?? []).filter((r) => r.status === 'COVERED_UNAPPROVED').length;

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <EyeOff size={16} className="text-emerald-700 dark:text-emerald-400" /> Hidden works
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {isContractor
                ? 'Before you cover work up - backfill drainage, close a ceiling, screed over waterproofing - ask for it to be signed off. Add photos; once approved, cover it and mark it covered.'
                : 'Work is inspected and photographed before it is covered. Approve it once photos are on record, or turn it back. The register is the record of what lies where.'}
              {flagged > 0 && <span className="ml-1 font-medium text-red-700 dark:text-red-400">{flagged} covered before sign-off.</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Trade" className={`${selectCls} h-9 w-40`} value={trade} onChange={setTrade} options={[{ value: '', label: 'All trades' }, ...TRADES.map((t) => ({ value: t, label: t }))]} />
            <Select aria-label="Show" className={`${selectCls} h-9 w-32`} value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'Register' }]} />
            {!adding && opts?.you.site && (
              <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
                <Plus size={14} /> Ask for sign-off
              </button>
            )}
          </div>
        </div>

        {adding && (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <label className={`${labelCls} sm:col-span-3`}>
              What is about to be covered
              <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sewer MH3 to MH5, before backfill" />
            </label>
            <div className={labelCls}>
              Trade
              <Select aria-label="Work trade" className={`${selectCls} mt-0.5 w-full`} value={form.trade} onChange={(v) => setForm({ ...form, trade: v })} options={TRADES.map((t) => ({ value: t, label: t }))} />
            </div>
            <label className={labelCls}>
              Where
              <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <label className={labelCls}>
              Ready to inspect
              <input type="datetime-local" className={`${inputCls} mt-0.5`} value={form.readyAt} onChange={(e) => setForm({ ...form, readyAt: e.target.value })} />
            </label>
            <div className={labelCls}>
              Inspector
              <Select aria-label="Inspector" className={`${selectCls} mt-0.5 w-full`} value={form.inspectorId} onChange={(v) => setForm({ ...form, inspectorId: v })} options={[{ value: '', label: 'Setjeka or any engineer' }, ...inspectors.map((m) => ({ value: m.id, label: m.name }))]} />
            </div>
            <div className={labelCls}>
              Programme activity
              <Select aria-label="Programme activity" className={`${selectCls} mt-0.5 w-full`} value={form.scheduleActivityId} onChange={(v) => setForm({ ...form, scheduleActivityId: v })} options={[{ value: '', label: 'None' }, ...(opts?.activities ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
            </div>
            <label className={`${labelCls} sm:col-span-4`}>
              What is covered: sizes, depths, positions (optional)
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.asBuilt} onChange={(e) => setForm({ ...form, asBuilt: e.target.value })} placeholder="e.g. 160 mm uPVC at 1:60, invert 1.2 m below ground at MH3" />
            </label>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim()} className={primaryBtn}>
                Ask for sign-off
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-4">Add photos of the work on the next screen.</p>
          </form>
        )}
      </div>

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'open' ? 'Nothing waiting to be signed off or covered.' : 'No hidden works recorded.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => setSelectedId(h.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{h.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{h.title}</span>
                  <span className="block text-xs text-slate-500">
                    {h.trade ?? 'Hidden work'}
                    {h.location && ` · ${h.location}`} · {h.photoCount} photo{h.photoCount === 1 ? '' : 's'}
                    {h.coveredAt && ` · covered ${fmtDay(h.coveredAt)}`}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[h.status].tone}`}>{STATUS[h.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
