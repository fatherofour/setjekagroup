'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Landmark, Pencil, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import {
  CONSENT_EVENT,
  CONSENT_STATUS,
  cardCls,
  fmtDay,
  inputCls,
  selectCls,
  labelCls,
  memberName,
  primaryBtn,
  secondaryBtn,
  textareaCls,
  todayIso,
  type ConsentEventKind,
  type ConsentStatus,
  type Member,
} from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

interface ConsentEvent {
  id: string;
  kind: ConsentEventKind;
  date: string;
  note: string | null;
  createdBy: { fullName: string };
  document: { id: string; name: string; drawingNumber: string | null } | null;
}
interface Consent {
  id: string;
  title: string;
  authority: string | null;
  category: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  requiredByStage: string;
  plannedSubmission: string | null;
  expectedDecisionAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  status: ConsentStatus;
  reference: string | null;
  notes: string | null;
  events: ConsentEvent[];
  submissions: number;
  waitingDays: number | null;
  overdue: boolean;
}
interface Doc {
  id: string;
  name: string;
  drawingNumber?: string | null;
}

const STAGES = [
  { value: 'INCEPTION', label: 'Stage 1 · Inception' },
  { value: 'CONCEPT', label: 'Stage 2 · Concept & Viability' },
  { value: 'DESIGN', label: 'Stage 3 · Design Development' },
  { value: 'DOCUMENTATION_PROCUREMENT', label: 'Stage 4 · Documentation & Procurement' },
  { value: 'CONSTRUCTION', label: 'Stage 5 · Construction' },
  { value: 'CLOSEOUT', label: 'Stage 6 · Close-out' },
];
const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const blank = () => ({ title: '', authority: '', category: '', responsibleId: '', requiredByStage: 'DESIGN', plannedSubmission: '', expectedDecisionAt: '', reference: '', notes: '' });

/** What the next round with the authority can be, given where it stands. */
function nextKinds(c: Consent): ConsentEventKind[] {
  const submitted = c.submissions > 0;
  if (!submitted) return ['SUBMITTED', 'NOTE'];
  if (c.status === 'APPROVED' || c.status === 'REJECTED') return c.status === 'REJECTED' ? ['RESUBMITTED', 'NOTE'] : ['NOTE'];
  if (c.status === 'RETURNED_WITH_COMMENTS') return ['RESUBMITTED', 'NOTE'];
  return ['COMMENTS_RECEIVED', 'APPROVED', 'REJECTED', 'NOTE'];
}

/** Authority approvals (Architect 2.5, 2.11, 3.8, 5.14): the consents
 * scheduled at Stage 1, followed through each round with the municipality
 * or other authority until a decision. */
export function AuthoritiesPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [items, setItems] = useState<Consent[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [round, setRound] = useState<{ kind: ConsentEventKind; date: string; note: string; reference: string; documentId: string } | null>(null);

  const apply = (r: { items: Consent[]; categories: string[] }) => {
    setItems(r.items);
    setCategories(r.categories);
  };
  const load = useCallback(() => {
    authedFetch<{ items: Consent[]; categories: string[] }>(`/projects/${projectId}/authorities`)
      .then(apply)
      .catch((e) => setError(err(e, 'Could not load authority approvals')));
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
    authedFetch<Doc[]>(`/projects/${projectId}/documents`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  async function save() {
    if (!form) return;
    setError(null);
    const body = {
      ...form,
      authority: form.authority || null,
      category: form.category || null,
      responsibleId: form.responsibleId || null,
      plannedSubmission: form.plannedSubmission || null,
      expectedDecisionAt: form.expectedDecisionAt || null,
      reference: form.reference || null,
      notes: form.notes || null,
    };
    try {
      apply(await authedFetch(editId ? `/projects/${projectId}/authorities/${editId}` : `/projects/${projectId}/authorities`, { method: editId ? 'PATCH' : 'POST', body }));
      setForm(null);
      setEditId(null);
    } catch (e) {
      setError(err(e, 'Could not save'));
    }
  }

  async function record(c: Consent) {
    if (!round) return;
    setError(null);
    try {
      apply(
        await authedFetch(`/projects/${projectId}/authorities/${c.id}/events`, {
          method: 'POST',
          body: { kind: round.kind, date: round.date, note: round.note || undefined, reference: round.reference || undefined, documentId: round.documentId || undefined },
        }),
      );
      setRound(null);
    } catch (e) {
      setError(err(e, 'Could not record it'));
    }
  }

  const team = members.filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: memberName(m) }));
  const waiting = items?.filter((c) => c.status === 'SUBMITTED').length ?? 0;
  const overdue = items?.filter((c) => c.overdue).length ?? 0;

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Landmark size={15} /> Authority approvals
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Site development plans, building plans, rezoning, occupancy and other statutory approvals - each followed through its submissions, the authority&apos;s comments and resubmissions until a decision.
            </p>
          </div>
          {!form && (
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                setEditId(null);
                setForm(blank());
              }}
            >
              <Plus size={14} /> Add an approval
            </button>
          )}
        </div>
        {items && items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{items.length} on the schedule</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800 dark:bg-sky-950 dark:text-sky-300">{waiting} with an authority</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{items.filter((c) => c.status === 'APPROVED').length} approved</span>
            {overdue > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 dark:bg-red-950 dark:text-red-300">{overdue} past the expected decision</span>}
          </div>
        )}

        {form && (
          <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700">
            <label className={`${labelCls} sm:col-span-2`}>
              What it is
              <input className={`${inputCls} mt-0.5`} placeholder="e.g. Building plans - City of Tshwane" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className={labelCls}>
              Authority
              <input className={`${inputCls} mt-0.5`} placeholder="City of Tshwane" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
            </label>
            <div className={labelCls}>
              Type
              <Select className={`${selectCls} mt-0.5 w-full`} value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={[{ value: '', label: '—' }, ...categories.map((c) => ({ value: c, label: c }))]} aria-label="Type" />
            </div>
            <div className={labelCls}>
              Needed by
              <Select className={`${selectCls} mt-0.5 w-full`} value={form.requiredByStage} onChange={(v) => setForm({ ...form, requiredByStage: v })} options={STAGES} aria-label="Needed by" />
            </div>
            <div className={labelCls}>
              Responsible
              <Select className={`${selectCls} mt-0.5 w-full`} value={form.responsibleId} onChange={(v) => setForm({ ...form, responsibleId: v })} options={[{ value: '', label: '—' }, ...team]} aria-label="Responsible" />
            </div>
            <label className={labelCls}>
              Planned submission
              <DateInput className={`${inputCls} mt-0.5`} value={form.plannedSubmission} onChange={(e) => setForm({ ...form, plannedSubmission: e.target.value })} />
            </label>
            <label className={labelCls}>
              Decision expected by
              <DateInput className={`${inputCls} mt-0.5`} value={form.expectedDecisionAt} onChange={(e) => setForm({ ...form, expectedDecisionAt: e.target.value })} />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-4`}>
              Notes
              <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button type="button" className={primaryBtn} disabled={!form.title.trim()} onClick={save}>
                {editId ? 'Save' : 'Add'}
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
      </section>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {items === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className={`${cardCls} p-6 text-center text-sm text-slate-500`}>No approvals scheduled yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => {
            const expanded = open === c.id;
            const st = CONSENT_STATUS[c.status];
            return (
              <li key={c.id} className={cardCls}>
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                  {expanded ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{c.title}</span>
                    <span className="block text-xs text-slate-500">
                      {[c.category, c.authority, c.reference && `Ref ${c.reference}`, c.responsibleName].filter(Boolean).join(' · ') || 'No details yet'}
                    </span>
                  </span>
                  {c.overdue && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
                      <AlertTriangle size={12} /> Decision overdue
                    </span>
                  )}
                  {c.status === 'SUBMITTED' && c.waitingDays !== null && <span className="text-xs text-slate-500">{c.waitingDays} days with the authority</span>}
                  {c.submissions > 1 && <span className="text-xs text-slate-500">{c.submissions} submissions</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
                </button>
                {expanded && (
                  <div className="border-t border-slate-100 p-3 dark:border-slate-800">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rounds with the authority</h4>
                        {c.events.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500">Nothing recorded yet{c.plannedSubmission ? ` - submission planned for ${fmtDay(c.plannedSubmission)}` : ''}.</p>
                        ) : (
                          <ol className="mt-2 space-y-2 border-l-2 border-slate-100 pl-3 dark:border-slate-800">
                            {c.events.map((e) => (
                              <li key={e.id} className="text-sm">
                                <span className="font-medium text-slate-800 dark:text-slate-100">{CONSENT_EVENT[e.kind]}</span>
                                <span className="text-xs text-slate-500"> · {fmtDay(e.date)} · {e.createdBy.fullName}</span>
                                {e.note && <p className="text-xs text-slate-600 dark:text-slate-300">{e.note}</p>}
                                {e.document && <p className="text-xs text-emerald-700 dark:text-emerald-400">{e.document.drawingNumber ? `${e.document.drawingNumber} ` : ''}{e.document.name}</p>}
                              </li>
                            ))}
                          </ol>
                        )}
                        {round && open === c.id ? (
                          <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
                            <div className={labelCls}>
                              What happened
                              <Select className={`${selectCls} mt-0.5 w-full`} value={round.kind} onChange={(v) => setRound({ ...round, kind: v as ConsentEventKind })} options={nextKinds(c).map((k) => ({ value: k, label: CONSENT_EVENT[k] }))} aria-label="What happened" />
                            </div>
                            <label className={labelCls}>
                              Date
                              <DateInput max={todayIso()} className={`${inputCls} mt-0.5`} value={round.date} onChange={(e) => setRound({ ...round, date: e.target.value })} />
                            </label>
                            {(round.kind === 'SUBMITTED' || round.kind === 'RESUBMITTED') && (
                              <label className={labelCls}>
                                Authority&apos;s reference
                                <input className={`${inputCls} mt-0.5`} value={round.reference} onChange={(e) => setRound({ ...round, reference: e.target.value })} />
                              </label>
                            )}
                            <div className={labelCls}>
                              Document
                              <Select className={`${selectCls} mt-0.5 w-full`} value={round.documentId} onChange={(v) => setRound({ ...round, documentId: v })} options={[{ value: '', label: 'None' }, ...docs.map((d) => ({ value: d.id, label: `${d.drawingNumber ? `${d.drawingNumber} ` : ''}${d.name}` }))]} aria-label="Document" />
                            </div>
                            <label className={`${labelCls} sm:col-span-2`}>
                              Note
                              <textarea className={`${textareaCls} mt-0.5`} rows={2} placeholder={round.kind === 'COMMENTS_RECEIVED' ? "The authority's comments" : ''} value={round.note} onChange={(e) => setRound({ ...round, note: e.target.value })} />
                            </label>
                            <div className="flex gap-2 sm:col-span-2">
                              <button type="button" className={primaryBtn} onClick={() => record(c)}>
                                Record
                              </button>
                              <button type="button" className={secondaryBtn} onClick={() => setRound(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className={primaryBtn} onClick={() => setRound({ kind: nextKinds(c)[0], date: todayIso(), note: '', reference: c.reference ?? '', documentId: '' })}>
                              Record a round
                            </button>
                            <button
                              type="button"
                              className={secondaryBtn}
                              onClick={() => {
                                setEditId(c.id);
                                setForm({
                                  title: c.title,
                                  authority: c.authority ?? '',
                                  category: c.category ?? '',
                                  responsibleId: c.responsibleId ?? '',
                                  requiredByStage: c.requiredByStage,
                                  plannedSubmission: c.plannedSubmission?.slice(0, 10) ?? '',
                                  expectedDecisionAt: c.expectedDecisionAt?.slice(0, 10) ?? '',
                                  reference: c.reference ?? '',
                                  notes: c.notes ?? '',
                                });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          </div>
                        )}
                      </div>
                      <CommentThread projectId={projectId} entityType="CONSENT" entityId={c.id} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
