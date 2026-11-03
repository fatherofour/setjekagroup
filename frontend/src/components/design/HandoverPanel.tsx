'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, FolderCheck, Paperclip, Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls } from '@/lib/architect';

type Kind = 'AS_BUILT' | 'O_AND_M_MANUAL' | 'WARRANTY' | 'GUARANTEE' | 'STATUTORY_CERTIFICATE' | 'COMMISSIONING' | 'HEALTH_AND_SAFETY_FILE' | 'OTHER';
type Status = 'OUTSTANDING' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED' | 'HANDED_OVER';

interface ContractPack {
  id: string;
  title: string;
  contractor: { name: string };
  finalCompletionAt: string | null;
  counts: { total: number; outstanding: number; submitted: number; accepted: number; handedOver: number };
  can: { addItems: boolean; handOver: boolean };
}

interface Item {
  id: string;
  number: string;
  kind: Kind;
  title: string;
  system: string | null;
  dueDate: string | null;
  status: Status;
  issuer: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  handedOverAt: string | null;
  needsExpiry: boolean;
  overdue: boolean;
  expiringSoon: boolean;
  contract: { id: string; title: string; contractor: { name: string } };
  reviewedBy: { fullName: string } | null;
  files: { id: string; filename: string; size: number; createdAt: string; uploadedBy: { fullName: string } }[];
  history: { status: Status; at: string; name: string; comment: string | null }[];
  can: { upload: boolean; submit: boolean; accept: boolean; return: boolean; remove: boolean };
}

const KIND: Record<Kind, string> = {
  AS_BUILT: 'As-built drawings',
  O_AND_M_MANUAL: 'O&M manual',
  WARRANTY: 'Warranty',
  GUARANTEE: 'Guarantee',
  STATUTORY_CERTIFICATE: 'Compliance certificate',
  COMMISSIONING: 'Commissioning records',
  HEALTH_AND_SAFETY_FILE: 'Health and safety file',
  OTHER: 'Other',
};
const STATUS: Record<Status, { label: string; tone: string }> = {
  OUTSTANDING: { label: 'Outstanding', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SUBMITTED: { label: 'Submitted, to review', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  RETURNED: { label: 'Returned', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  ACCEPTED: { label: 'Accepted', tone: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  HANDED_OVER: { label: 'Handed over', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
};
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const size = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function useDownload(projectId: string) {
  const { accessToken } = useAuth();
  return useCallback(
    async (itemId: string, file: { id: string; filename: string }) => {
      const url = await apiFetchBlobUrl(`/projects/${projectId}/handover/${itemId}/files/${file.id}`, accessToken);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    [accessToken, projectId],
  );
}

function Detail({ projectId, id, onBack, onChanged }: { projectId: string; id: string; onBack: () => void; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const download = useDownload(projectId);
  const [i, setI] = useState<Item | null>(null);
  const [form, setForm] = useState({ issuer: '', expiresAt: '' });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `/projects/${projectId}/handover/${id}`;

  useEffect(() => {
    authedFetch<Item>(base)
      .then((x) => {
        setI(x);
        setForm({ issuer: x.issuer ?? '', expiresAt: x.expiresAt?.slice(0, 10) ?? '' });
      })
      .catch((e) => setError(err(e, 'Failed to load the item.')));
  }, [authedFetch, base]);

  async function run(fn: () => Promise<Item>) {
    setError(null);
    setBusy(true);
    try {
      setI(await fn());
      setComment('');
      onChanged();
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f);
      await run(() => authedFetch<Item>(`${base}/files`, { method: 'POST', formData: fd }));
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  if (!i) return <p className={error ? errBox : 'text-sm text-slate-400'}>{error ?? 'Loading…'}</p>;
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> The handover pack
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {i.number} · {i.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {KIND[i.kind]}
            {i.system && ` · ${i.system}`} · {i.contract.title} ({i.contract.contractor.name})
            {i.dueDate && ` · due ${fmtDay(i.dueDate)}`}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {i.overdue && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
        </span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      {(i.issuer || i.expiresAt) && (
        <p className={`mt-3 text-sm ${i.expiringSoon ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
          {i.issuer && `Given by ${i.issuer}. `}
          {i.expiresAt && `Runs to ${fmtDay(i.expiresAt)}.`}
        </p>
      )}
      {i.reviewComment && (
        <p className="mt-2 text-xs text-slate-500">
          {i.reviewedBy?.fullName}, {fmtDay(i.reviewedAt)}: {i.reviewComment}
        </p>
      )}
      {i.handedOverAt && <p className="mt-1 text-xs text-slate-500">Handed to the client on {fmtDay(i.handedOverAt)}</p>}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Files ({i.files.length})</h4>
          {i.can.upload && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} /> Add files
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.ifc,.zip,.jpg,.jpeg,.png" onChange={(e) => upload(e.target.files)} aria-label="Add handover files" />
            </>
          )}
        </div>
        {i.files.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">{i.can.upload ? 'Upload the document: PDF, Word, Excel, drawings, IFC, zip or photos, up to 30 MB each.' : 'Nothing uploaded yet.'}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {i.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-800 dark:text-slate-100">{f.filename}</span>
                  <span className="block text-[11px] text-slate-500">
                    {size(f.size)} · {f.uploadedBy.fullName} · {fmtDay(f.createdAt)}
                  </span>
                </span>
                <button type="button" onClick={() => download(i.id, f).catch((e) => setError(err(e, 'Download failed.')))} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Download ${f.filename}`}>
                  <Download size={15} />
                </button>
                {i.can.upload && (
                  <button type="button" onClick={() => run(() => authedFetch<Item>(`${base}/files/${f.id}`, { method: 'DELETE' }))} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Remove ${f.filename}`}>
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {i.can.upload && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            run(() => authedFetch<Item>(`${base}/submit`, { method: 'POST', body: { issuer: form.issuer || undefined, expiresAt: form.expiresAt || undefined, comment: comment || undefined } }));
          }}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700"
        >
          {i.needsExpiry && (
            <>
              <label className={labelCls}>
                Given by
                <input className={`${inputCls} mt-0.5`} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Manufacturer or supplier" />
              </label>
              <label className={labelCls}>
                Runs to
                <input type="date" className={`${inputCls} mt-0.5`} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </label>
            </>
          )}
          <label className={`${labelCls} ${i.needsExpiry ? '' : 'sm:col-span-3'}`}>
            Note (optional)
            <input className={`${inputCls} mt-0.5`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy || !i.can.submit || (i.needsExpiry && !form.expiresAt)} className={primaryBtn}>
              Submit for review
            </button>
          </div>
        </form>
      )}

      {(i.can.accept || i.can.return) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label className={labelCls}>
            Comment (needed to return it)
            <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => authedFetch<Item>(`${base}/accept`, { method: 'POST', body: { comment: comment || undefined } }))} className={primaryBtn}>
              Accept
            </button>
            <button type="button" disabled={busy || !comment.trim()} onClick={() => run(() => authedFetch<Item>(`${base}/return`, { method: 'POST', body: { reason: comment } }))} className={secondaryBtn}>
              Return to the contractor
            </button>
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {i.history.map((h, k) => (
          <li key={k}>
            {fmtDayTime(h.at)} · {h.name} · {STATUS[h.status]?.label ?? h.status}
            {h.comment && ` — ${h.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="HANDOVER_ITEM" entityId={i.id} />
      </div>
    </div>
  );
}

/** The handover pack (the user's choice, 2026-11-03): what each contractor
 * hands over, reviewed by the consultants and handed to the client. */
export function HandoverPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const download = useDownload(projectId);
  const [contracts, setContracts] = useState<ContractPack[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('item'));
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: 'O_AND_M_MANUAL' as Kind, title: '', system: '', dueDate: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<ContractPack[]>(`/projects/${projectId}/handover/contracts`)
      .then(setContracts)
      .catch((e) => setError(err(e, 'Failed to load the handover pack.')));
    authedFetch<Item[]>(`/projects/${projectId}/handover`)
      .then(setItems)
      .catch(() => undefined);
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  // An alert about a whole contract's pack links to the contract.
  useEffect(() => {
    if (selectedId && contracts?.some((k) => k.id === selectedId)) setSelectedId(null);
  }, [contracts, selectedId]);

  if (selectedId && !contracts?.some((k) => k.id === selectedId)) return <Detail projectId={projectId} id={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />;

  async function act(fn: () => Promise<unknown>, fail: string) {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(err(e, fail));
    }
  }

  const clientView = Boolean(contracts?.length) && contracts!.every((k) => !k.can.addItems) && (items ?? []).every((i) => i.status === 'HANDED_OVER');

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <FolderCheck size={16} className="text-emerald-700 dark:text-emerald-400" /> Handover pack
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          {clientView
            ? 'The documents handed over to you for each contract: as-built drawings, manuals, warranties and compliance certificates.'
            : 'What each contractor hands over: as-built drawings, O&M manuals, warranties and guarantees, compliance certificates, commissioning records and the health and safety file. The contractor uploads each, a consultant accepts it, and Setjeka hands the pack to the client. Final completion waits on it.'}
        </p>
      </div>

      {contracts === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>No contracts on this project yet.</p>
      ) : (
        contracts.map((k) => {
          const rows = (items ?? []).filter((i) => i.contract.id === k.id);
          return (
            <section key={k.id} className={`${cardCls} p-4`} aria-label={`${k.title} handover`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{k.title}</p>
                  <p className="text-xs text-slate-500">
                    {k.contractor.name} · {clientView ? `${k.counts.handedOver} handed over` : `${k.counts.accepted + k.counts.handedOver} of ${k.counts.total} accepted · ${k.counts.handedOver} handed over · ${k.counts.submitted} to review · ${k.counts.outstanding} outstanding`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {k.can.addItems && (
                    <>
                      <button type="button" onClick={() => act(() => authedFetch(`/projects/${projectId}/handover/contracts/${k.id}/starter`, { method: 'POST' }), 'Could not add the usual pack.')} className={secondaryBtn}>
                        Add the usual pack
                      </button>
                      <button type="button" onClick={() => setAdding(adding === k.id ? null : k.id)} className={secondaryBtn}>
                        <Plus size={14} /> Add a document
                      </button>
                    </>
                  )}
                  {k.can.handOver && (
                    <button type="button" onClick={() => confirm(`Hand ${k.counts.accepted} accepted document${k.counts.accepted === 1 ? '' : 's'} to the client?`) && act(() => authedFetch(`/projects/${projectId}/handover/contracts/${k.id}/hand-over`, { method: 'POST', body: {} }), 'Could not hand over.')} className={primaryBtn}>
                      Hand over {k.counts.accepted} to the client
                    </button>
                  )}
                </div>
              </div>

              {adding === k.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await authedFetch(`/projects/${projectId}/handover`, { method: 'POST', body: { contractId: k.id, kind: form.kind, title: form.title.trim(), system: form.system.trim() || undefined, dueDate: form.dueDate || undefined } });
                      setAdding(null);
                      setForm({ kind: 'O_AND_M_MANUAL', title: '', system: '', dueDate: '' });
                    }, 'Could not add the document.');
                  }}
                  className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40"
                >
                  <div className={labelCls}>
                    Type
                    <Select aria-label="Type" className={`${selectCls} mt-0.5 w-full`} value={form.kind} onChange={(v) => setForm({ ...form, kind: v as Kind })} options={(Object.keys(KIND) as Kind[]).map((x) => ({ value: x, label: KIND[x] }))} />
                  </div>
                  <label className={`${labelCls} sm:col-span-2`}>
                    Document
                    <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lift maintenance manual" />
                  </label>
                  <label className={labelCls}>
                    System (optional)
                    <input className={`${inputCls} mt-0.5`} value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} placeholder="e.g. Lifts" />
                  </label>
                  <label className={labelCls}>
                    Due
                    <input type="date" className={`${inputCls} mt-0.5`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                  </label>
                  <div className="flex items-end gap-2 sm:col-span-3">
                    <button type="submit" disabled={!form.title.trim()} className={primaryBtn}>
                      Add
                    </button>
                    <button type="button" onClick={() => setAdding(null)} className={secondaryBtn}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {rows.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">{clientView ? 'Nothing handed over yet.' : 'Nothing asked for yet.'}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                      <button type="button" onClick={() => setSelectedId(i.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                        <span className="font-mono text-xs text-slate-500">{i.number}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-slate-800 hover:text-emerald-700 dark:text-slate-100">{i.title}</span>
                          <span className="block text-xs text-slate-500">
                            {KIND[i.kind]}
                            {i.system && ` · ${i.system}`} · {i.files.length} file{i.files.length === 1 ? '' : 's'}
                            {i.expiresAt && <span className={i.expiringSoon ? 'text-amber-700 dark:text-amber-400' : ''}> · runs to {fmtDay(i.expiresAt)}</span>}
                          </span>
                        </span>
                        {i.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
                      </button>
                      {clientView && i.files[0] && (
                        <button type="button" onClick={() => download(i.id, i.files[0]).catch((e) => setError(err(e, 'Download failed.')))} className={secondaryBtn} aria-label={`Download ${i.title}`}>
                          <Download size={14} /> Download
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
