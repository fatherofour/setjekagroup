'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CornerDownRight, FileText, Forward, Loader2, Mail, Plus, Send, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { COMM_STATUS, KIND_HELP, KIND_LABEL, ROLE_LABEL, cardCls, fmtDay, fmtDayTime, inputCls, selectCls, labelCls, primaryBtn, secondaryBtn, textareaCls, type CommunicationKind, type CommunicationStatus } from '@/lib/architect';

interface Person {
  userId: string;
  name: string;
  role: string;
  company: string | null;
  setjeka: boolean;
}
interface AddressBook {
  internal: boolean;
  client: boolean;
  drafter: boolean;
  setjeka: Person[];
  people: Person[];
  contractors: Person[];
  kinds: CommunicationKind[];
}
interface Communication {
  id: string;
  number: string;
  kind: CommunicationKind;
  kindLabel: string;
  status: CommunicationStatus;
  subject: string;
  body: string;
  author: { id: string; fullName: string };
  issuedBy: { id: string; fullName: string } | null;
  issuedAt: string | null;
  createdAt: string;
  responseDueAt: string | null;
  costImpact: boolean;
  timeImpact: boolean;
  recipients: { id: string; userId: string; acknowledgedAt: string | null; response: string | null; respondedAt: string | null; user: { id: string; fullName: string } }[];
  documents: { document: { id: string; name: string; drawingNumber: string | null } }[];
  parent: { id: string; number: string; kind: CommunicationKind; subject: string } | null;
  children: { id: string; number: string; kindLabel: string; status: CommunicationStatus; issuedAt: string | null; to: string[]; subject: string | null }[];
  variations: { id: string; number: string; title: string; status: string }[];
  myReceipt: { acknowledgedAt: string | null; respondedAt: string | null } | null;
  noteCount?: number;
  can: { edit: boolean; send: boolean; issue: boolean; acknowledge: boolean; respond: boolean; close: boolean; cancel: boolean; raiseVariation: boolean; passOn: boolean };
}
interface Doc {
  id: string;
  name: string;
  drawingNumber?: string | null;
  revisions?: { id: string }[];
}
interface Draft {
  kind: CommunicationKind;
  subject: string;
  body: string;
  recipientIds: string[];
  responseDueAt: string;
  costImpact: boolean;
  timeImpact: boolean;
  documentIds: string[];
  parentId: string | null;
  parentLabel: string | null;
}

const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Instructions and letters (the user's decision, 26 Oct 2026): the client
 * reaches the architect only through Setjeka's PM and DM, and the architect
 * reaches the contractor through an instruction Setjeka issues. Everything
 * is on the platform, with a receipt and a reply from each recipient. */
export function InstructionsPanel({ projectId }: { projectId: string }) {
  const { authedFetch, accessToken } = useAuth();
  const [book, setBook] = useState<AddressBook | null>(null);
  const [list, setList] = useState<Communication[] | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('communication') : null));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState('');
  const [variationValue, setVariationValue] = useState('');

  const load = useCallback(() => {
    authedFetch<Communication[]>(`/projects/${projectId}/communications`)
      .then(setList)
      .catch((e) => setError(err(e, 'Could not load instructions')));
  }, [authedFetch, projectId]);
  useEffect(() => {
    load();
    authedFetch<AddressBook>(`/projects/${projectId}/communications-address-book`)
      .then(setBook)
      .catch(() => setBook(null));
    authedFetch<Doc[]>(`/projects/${projectId}/documents`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [authedFetch, projectId, load]);

  const shown = useMemo(() => (list ?? []).filter((c) => (!kindFilter || c.kind === kindFilter) && (!statusFilter || c.status === statusFilter)), [list, kindFilter, statusFilter]);
  const selected = list?.find((c) => c.id === selectedId) ?? null;
  const replace = (c: Communication) => setList((all) => (all ? (all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? { ...c, noteCount: x.noteCount } : x)) : [c, ...all]) : [c]));

  function compose(kind?: CommunicationKind, parent?: Communication) {
    if (!book) return;
    setSelectedId(null);
    setDraft({
      kind: kind ?? book.kinds[0],
      subject: parent ? parent.subject : '',
      body: parent ? `Passing on ${parent.number}:\n\n${parent.body}` : '',
      recipientIds: [],
      responseDueAt: '',
      costImpact: false,
      timeImpact: false,
      documentIds: parent ? parent.documents.map((d) => d.document.id) : [],
      parentId: parent?.id ?? null,
      parentLabel: parent ? `${parent.number} ${parent.subject}` : null,
    });
  }

  // Who it goes to, under the routing rules the server enforces.
  const fixedTo = draft && book && !book.internal && draft.kind !== 'CONTRACT_INSTRUCTION';
  const choices = draft && book ? (draft.kind === 'CONTRACT_INSTRUCTION' ? book.contractors : book.people) : [];

  async function submit(send: boolean) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const c = await authedFetch<Communication>(`/projects/${projectId}/communications`, {
        method: 'POST',
        body: {
          kind: draft.kind,
          subject: draft.subject,
          body: draft.body,
          recipientIds: fixedTo ? undefined : draft.recipientIds,
          responseDueAt: draft.responseDueAt || undefined,
          costImpact: draft.costImpact,
          timeImpact: draft.timeImpact,
          documentIds: draft.documentIds,
          parentId: draft.parentId ?? undefined,
          send,
        },
      });
      replace(c);
      setDraft(null);
      setSelectedId(c.id);
    } catch (e) {
      setError(err(e, 'Could not send it'));
    } finally {
      setBusy(false);
    }
  }

  async function act(c: Communication, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      replace(await authedFetch<Communication>(`/projects/${projectId}/communications/${c.id}/${path}`, { method: 'POST', body }));
      setResponse('');
      setVariationValue('');
      if (path === 'variation') load();
    } catch (e) {
      setError(err(e, 'That did not work'));
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(id: string) {
    const doc = docs.find((d) => d.id === id);
    const rev = doc?.revisions?.[0];
    if (!rev) return;
    const url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${id}/revisions/${rev.id}/file`, accessToken);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const kindOptions = (book?.kinds ?? []).map((k) => ({ value: k, label: KIND_LABEL[k] }));
  const awaiting = (list ?? []).filter((c) => c.can.issue).length;
  const toAnswer = (list ?? []).filter((c) => c.myReceipt && !c.myReceipt.respondedAt && ['ISSUED', 'RESPONDED'].includes(c.status)).length;

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Mail size={15} /> Instructions and letters
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {book?.internal
                ? 'Client requests come to you; pass them on to the architect or contractor as a Setjeka instruction. Contract instructions drafted by the architect wait here for you to issue.'
                : book?.drafter
                  ? 'Write to Setjeka here. Contract instructions you draft go to the contractor once Setjeka issues them.'
                  : 'Everything you send goes to Setjeka’s Project Manager and Development Manager, who take it forward.'}
            </p>
          </div>
          {book && !draft && (
            <button type="button" className={primaryBtn} onClick={() => compose()}>
              <Plus size={14} /> {book.client ? 'New request' : 'New'}
            </button>
          )}
        </div>
        {(awaiting > 0 || toAnswer > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {awaiting > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{awaiting} waiting for you to issue</span>}
            {toAnswer > 0 && <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">{toAnswer} waiting for your reply</span>}
          </div>
        )}
      </section>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {draft && book && (
        <section className={`${cardCls} p-4`} aria-label="Compose">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{draft.parentLabel ? `Pass on ${draft.parentLabel}` : 'New'}</h3>
            <button type="button" aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setDraft(null)}>
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className={labelCls}>
              Type
              <Select className={`${selectCls} mt-0.5 w-full`} value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v as CommunicationKind, recipientIds: [] })} options={kindOptions} aria-label="Type" />
              <span className="mt-1 block font-normal text-slate-500">{KIND_HELP[draft.kind]}</span>
            </div>
            <div className={labelCls}>
              To
              {fixedTo ? (
                <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-2 text-sm font-normal text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Setjeka: {book.setjeka.map((p) => `${p.name} (${ROLE_LABEL[p.role] ?? p.role})`).join(', ') || 'the project team'}
                </p>
              ) : choices.length === 0 ? (
                <p className="mt-1 text-sm font-normal text-amber-700 dark:text-amber-400">{draft.kind === 'CONTRACT_INSTRUCTION' ? 'No contractor with a login is on this project yet.' : 'Nobody to address yet.'}</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Recipients">
                  {choices.map((p) => {
                    const on = draft.recipientIds.includes(p.userId);
                    return (
                      <button
                        key={`${p.userId}-${p.role}`}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDraft({ ...draft, recipientIds: on ? draft.recipientIds.filter((x) => x !== p.userId) : [...new Set([...draft.recipientIds, p.userId])] })}
                        className={`rounded-full border px-2.5 py-1 text-xs font-normal ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        {on && <Check size={11} className="mr-1 inline" />}
                        {p.name} <span className="text-slate-500">· {p.company ?? ROLE_LABEL[p.role] ?? p.role}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <label className={`${labelCls} lg:col-span-2`}>
              Subject
              <input className={`${inputCls} mt-0.5`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </label>
            <label className={`${labelCls} lg:col-span-2`}>
              Message
              <textarea className={`${textareaCls} mt-0.5`} rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </label>
            <label className={labelCls}>
              Reply needed by
              <input type="date" className={`${inputCls} mt-0.5`} value={draft.responseDueAt} onChange={(e) => setDraft({ ...draft, responseDueAt: e.target.value })} />
            </label>
            {draft.kind !== 'CORRESPONDENCE' && draft.kind !== 'CLIENT_REQUEST' && (
              <fieldset className="flex flex-wrap items-end gap-4 text-sm text-slate-700 dark:text-slate-200">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={draft.costImpact} onChange={(e) => setDraft({ ...draft, costImpact: e.target.checked })} />
                  May cost money
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={draft.timeImpact} onChange={(e) => setDraft({ ...draft, timeImpact: e.target.checked })} />
                  May affect the programme
                </label>
              </fieldset>
            )}
            <div className={`${labelCls} lg:col-span-2`}>
              Attach documents or drawings
              <Select
                className={`${selectCls} mt-0.5 w-full`}
                value=""
                onChange={(v) => v && setDraft({ ...draft, documentIds: [...new Set([...draft.documentIds, v])] })}
                options={[{ value: '', label: 'Add a document…' }, ...docs.filter((d) => !draft.documentIds.includes(d.id)).map((d) => ({ value: d.id, label: `${d.drawingNumber ? `${d.drawingNumber} ` : ''}${d.name}` }))]}
                aria-label="Attach a document"
              />
              {draft.documentIds.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {draft.documentIds.map((id) => {
                    const d = docs.find((x) => x.id === id);
                    return (
                      <li key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal dark:bg-slate-800">
                        <FileText size={11} /> {d ? `${d.drawingNumber ? `${d.drawingNumber} ` : ''}${d.name}` : 'Document'}
                        <button type="button" aria-label="Remove attachment" onClick={() => setDraft({ ...draft, documentIds: draft.documentIds.filter((x) => x !== id) })}>
                          <X size={11} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={busy || !draft.subject.trim() || !draft.body.trim() || (!fixedTo && !draft.recipientIds.length)} onClick={() => submit(true)}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {draft.kind === 'CONTRACT_INSTRUCTION' && !book.internal ? 'Send to Setjeka to issue' : 'Send'}
            </button>
            <button type="button" className={secondaryBtn} disabled={busy || !draft.subject.trim() || !draft.body.trim()} onClick={() => submit(false)}>
              Save as draft
            </button>
          </div>
        </section>
      )}

      {!draft && selected ? (
        <Detail
          c={selected}
          projectId={projectId}
          busy={busy}
          response={response}
          setResponse={setResponse}
          variationValue={variationValue}
          setVariationValue={setVariationValue}
          onBack={() => setSelectedId(null)}
          act={act}
          passOn={(c) => compose('SETJEKA_INSTRUCTION', c)}
          openDoc={openDoc}
          openRelated={(id) => setSelectedId(id)}
        />
      ) : (
        !draft && (
          <section className={cardCls} aria-label="Instructions and letters">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
              <Select className={`${selectCls} w-52`} value={kindFilter} onChange={setKindFilter} options={[{ value: '', label: 'Every type' }, ...(Object.keys(KIND_LABEL) as CommunicationKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))]} aria-label="Filter by type" />
              <Select className={`${selectCls} w-52`} value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Any status' }, ...(Object.keys(COMM_STATUS) as CommunicationStatus[]).map((s) => ({ value: s, label: COMM_STATUS[s].label }))]} aria-label="Filter by status" />
            </div>
            {list === null ? (
              <p className="p-4 text-sm text-slate-400">Loading…</p>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Nothing here yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelectedId(c.id)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="w-16 font-mono text-xs font-semibold text-slate-500">{c.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{c.subject}</span>
                        <span className="block text-xs text-slate-500">
                          {c.kindLabel} · {c.author.fullName} → {c.recipients.map((r) => r.user.fullName).join(', ') || '—'} · {fmtDay(c.issuedAt ?? c.createdAt)}
                        </span>
                      </span>
                      {c.responseDueAt && c.status === 'ISSUED' && <span className="text-xs text-slate-500">Reply by {fmtDay(c.responseDueAt)}</span>}
                      {(c.noteCount ?? 0) > 0 && <span className="text-xs text-slate-400">{c.noteCount} notes</span>}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COMM_STATUS[c.status].tone}`}>{COMM_STATUS[c.status].label}</span>
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

function Detail({
  c,
  projectId,
  busy,
  response,
  setResponse,
  variationValue,
  setVariationValue,
  onBack,
  act,
  passOn,
  openDoc,
  openRelated,
}: {
  c: Communication;
  projectId: string;
  busy: boolean;
  response: string;
  setResponse: (v: string) => void;
  variationValue: string;
  setVariationValue: (v: string) => void;
  onBack: () => void;
  act: (c: Communication, path: string, body?: unknown) => void;
  passOn: (c: Communication) => void;
  openDoc: (id: string) => void;
  openRelated: (id: string) => void;
}) {
  return (
    <section className={`${cardCls} p-4`} aria-label={`${c.number} ${c.subject}`}>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft size={13} /> All instructions and letters
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-500">
            {c.number} · {c.kindLabel}
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{c.subject}</h3>
          <p className="mt-1 text-xs text-slate-500">
            From {c.author.fullName}
            {c.issuedBy && c.issuedBy.id !== c.author.id && `, issued by ${c.issuedBy.fullName}`}
            {c.issuedAt ? ` on ${fmtDayTime(c.issuedAt)}` : ` · written ${fmtDayTime(c.createdAt)}`}
            {c.responseDueAt && ` · reply by ${fmtDay(c.responseDueAt)}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${COMM_STATUS[c.status].tone}`}>{COMM_STATUS[c.status].label}</span>
      </div>

      {c.parent && (
        <button type="button" onClick={() => openRelated(c.parent!.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          <CornerDownRight size={12} /> Passes on {c.parent.number} {c.parent.subject}
        </button>
      )}
      {(c.costImpact || c.timeImpact) && (
        <p className="mt-3 flex flex-wrap gap-2 text-xs">
          {c.costImpact && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">May cost money</span>}
          {c.timeImpact && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">May affect the programme</span>}
        </p>
      )}

      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">{c.body}</p>

      {c.documents.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {c.documents.map(({ document: d }) => (
            <li key={d.id}>
              <button type="button" onClick={() => openDoc(d.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <FileText size={12} /> {d.drawingNumber ? `${d.drawingNumber} ` : ''}
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-3">To</th>
              <th className="py-1 pr-3">Received</th>
              <th className="py-1">Reply</th>
            </tr>
          </thead>
          <tbody>
            {c.recipients.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-100">{r.user.fullName}</td>
                <td className="py-1.5 pr-3">{r.acknowledgedAt ? fmtDayTime(r.acknowledgedAt) : <span className="text-slate-400">Not yet</span>}</td>
                <td className="py-1.5 whitespace-pre-wrap">{r.response ? `${r.response} (${fmtDay(r.respondedAt)})` : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.children.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passed on</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {c.children.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2">
                <Forward size={13} className="text-slate-400" />
                {x.subject ? (
                  <button type="button" onClick={() => openRelated(x.id)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    {x.number} {x.subject}
                  </button>
                ) : (
                  <span className="font-medium text-slate-700 dark:text-slate-200">{x.number}</span>
                )}
                <span className="text-xs text-slate-500">
                  {x.kindLabel} to {x.to.join(', ')}
                  {x.issuedAt && ` on ${fmtDay(x.issuedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.variations.length > 0 && (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          Variation {c.variations.map((v) => `${v.number} (${v.status.toLowerCase().replace(/_/g, ' ')})`).join(', ')} raised from this - see Commercial.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {c.can.send && (
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => act(c, 'send')}>
            <Send size={14} /> Send
          </button>
        )}
        {c.can.issue && (
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => act(c, 'issue')}>
            <Send size={14} /> Issue to the contractor
          </button>
        )}
        {c.can.acknowledge && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => act(c, 'acknowledge')}>
            <Check size={14} /> Confirm received
          </button>
        )}
        {c.can.passOn && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => passOn(c)}>
            <Forward size={14} /> Pass on as an instruction
          </button>
        )}
        {c.can.close && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => act(c, 'close')}>
            Close
          </button>
        )}
        {c.can.cancel && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => window.confirm(`Cancel ${c.number}?`) && act(c, 'cancel')}>
            Cancel it
          </button>
        )}
      </div>

      {c.can.respond && (
        <div className="mt-4">
          <label className={labelCls}>
            Your reply
            <textarea className={`${textareaCls} mt-0.5`} rows={3} value={response} onChange={(e) => setResponse(e.target.value)} />
          </label>
          <button type="button" className={`${primaryBtn} mt-2`} disabled={busy || !response.trim()} onClick={() => act(c, 'respond', { response })}>
            Send reply
          </button>
        </div>
      )}

      {c.can.raiseVariation && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          <label className={labelCls}>
            Estimated value (ZAR)
            <input type="number" inputMode="decimal" className={`${inputCls} mt-0.5 w-44`} value={variationValue} onChange={(e) => setVariationValue(e.target.value)} />
          </label>
          <button type="button" className={secondaryBtn} disabled={busy || variationValue === ''} onClick={() => act(c, 'variation', { estimatedValue: Number(variationValue) })}>
            Raise a variation for the client
          </button>
        </div>
      )}

      <div className="mt-5">
        <CommentThread projectId={projectId} entityType="COMMUNICATION" entityId={c.id} />
      </div>
    </section>
  );
}
