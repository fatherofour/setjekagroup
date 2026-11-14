'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, inputCls, labelCls, memberName, primaryBtn, secondaryBtn, selectCls, textareaCls, type Member } from '@/lib/architect';
import { formatDateTime } from '@/lib/dates';
import { DateInput } from '@/components/ui/DateInput';

type Status = 'OPEN' | 'RESPONDED' | 'ACTION_AGREED' | 'READY_FOR_VERIFICATION' | 'CLOSED' | 'VOID';
type Kind = 'MATERIAL' | 'WORKMANSHIP' | 'DESIGN' | 'DOCUMENTATION' | 'OTHER';
type Severity = 'MINOR' | 'MAJOR' | 'CRITICAL';

interface Ncr {
  id: string;
  number: string;
  title: string;
  description: string;
  kind: Kind;
  severity: Severity;
  location: string | null;
  status: Status;
  dueDate: string | null;
  rootCauseCategory: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  costImpact: number | null;
  timeImpactDays: number | null;
  voidReason: string | null;
  createdAt: string;
  closedAt: string | null;
  raisedBy: { id: string; fullName: string };
  closedBy: { fullName: string } | null;
  assignee: { id: string; role: string; externalName: string | null; user: { fullName: string } | null } | null;
  inspection: { id: string; number: string; title: string } | null;
  testResult: { id: string; number: string; title: string } | null;
  hiddenWork: { id: string; number: string; title: string } | null;
  events: { id: string; toStatus: Status; comment: string | null; createdAt: string; actor: { fullName: string } }[];
  can: { edit: boolean; respond: boolean; agree: boolean; reject: boolean; ready: boolean; close: boolean; reopen: boolean; void: boolean };
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  OPEN: { label: 'With the contractor', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  RESPONDED: { label: 'Action proposed', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  ACTION_AGREED: { label: 'Being put right', tone: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  READY_FOR_VERIFICATION: { label: 'Ready to verify', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  CLOSED: { label: 'Closed', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  VOID: { label: 'Void', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const KIND: Record<Kind, string> = { MATERIAL: 'Material', WORKMANSHIP: 'Workmanship', DESIGN: 'Design', DOCUMENTATION: 'Documentation', OTHER: 'Other' };
const SEVERITY: Record<Severity, { label: string; tone: string }> = {
  MINOR: { label: 'Minor', tone: 'text-slate-600 dark:text-slate-300' },
  MAJOR: { label: 'Major', tone: 'text-amber-700 dark:text-amber-400' },
  CRITICAL: { label: 'Critical', tone: 'text-red-700 dark:text-red-400' },
};
const ROOT_CAUSES = ['Workmanship', 'Materials', 'Method of work', 'Supervision', 'Design information', 'Subcontractor', 'Other'];
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

function NcrDetail({ projectId, n, onBack, onChanged }: { projectId: string; n: Ncr; onBack: () => void; onChanged: (x: Ncr) => void }) {
  const { authedFetch } = useAuth();
  const [reply, setReply] = useState({ rootCauseCategory: ROOT_CAUSES[0], rootCause: '', correctiveAction: '', preventiveAction: '' });
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/ncrs/${n.id}`;

  async function act(path: string, body: object) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await authedFetch<Ncr>(`${base}/${path}`, { method: 'POST', body }));
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
        <ArrowLeft size={13} /> All NCRs
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {n.number} · {n.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {KIND[n.kind]} · <span className={SEVERITY[n.severity].tone}>{SEVERITY[n.severity].label}</span>
            {n.location && ` · ${n.location}`} · raised by {n.raisedBy.fullName} on {fmtDay(n.createdAt)}
            {n.assignee && ` · issued to ${memberName(n.assignee as Member)}`}
            {n.dueDate && ` · answer by ${fmtDay(n.dueDate)}`}
            {n.inspection && ` · from ${n.inspection.number} ${n.inspection.title}`}
            {n.testResult && ` · from test ${n.testResult.number} ${n.testResult.title}`}
            {n.hiddenWork && ` · from hidden work ${n.hiddenWork.number} ${n.hiddenWork.title}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[n.status].tone}`}>{STATUS[n.status].label}</span>
      </div>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{n.description}</p>
      {(n.costImpact != null || n.timeImpactDays != null) && (
        <p className="mt-2 text-xs text-slate-500">
          {n.costImpact != null && `Cost impact ${n.costImpact.toLocaleString('en-GB')}`}
          {n.costImpact != null && n.timeImpactDays != null && ' · '}
          {n.timeImpactDays != null && `Time impact ${n.timeImpactDays} days`}
        </p>
      )}

      {n.correctiveAction && (
        <dl className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 dark:bg-slate-800/40">
          <div>
            <dt className="text-xs font-medium text-slate-500">Root cause ({n.rootCauseCategory})</dt>
            <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">{n.rootCause}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Corrective action</dt>
            <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">{n.correctiveAction}</dd>
          </div>
          {n.preventiveAction && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">To stop it happening again</dt>
              <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">{n.preventiveAction}</dd>
            </div>
          )}
        </dl>
      )}
      {n.voidReason && <p className="mt-3 text-xs text-slate-500">Voided: {n.voidReason}</p>}

      {n.can.respond && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            act('respond', reply);
          }}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700"
        >
          <p className="text-sm font-medium text-slate-800 sm:col-span-2 dark:text-slate-100">Your answer</p>
          <div className={labelCls}>
            Root cause
            <Select className={`${selectCls} mt-0.5 w-full`} value={reply.rootCauseCategory} onChange={(v) => setReply({ ...reply, rootCauseCategory: v })} options={ROOT_CAUSES.map((r) => ({ value: r, label: r }))} aria-label="Root cause" />
          </div>
          <label className={`${labelCls} sm:col-span-2`}>
            Why it happened
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={reply.rootCause} onChange={(e) => setReply({ ...reply, rootCause: e.target.value })} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>
            How you will put it right
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={reply.correctiveAction} onChange={(e) => setReply({ ...reply, correctiveAction: e.target.value })} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>
            How you will stop it happening again (optional)
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={reply.preventiveAction} onChange={(e) => setReply({ ...reply, preventiveAction: e.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy || !reply.rootCause.trim() || !reply.correctiveAction.trim()} className={primaryBtn}>
              Send your answer
            </button>
          </div>
        </form>
      )}

      {(n.can.agree || n.can.close || n.can.ready || n.can.void) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label className={labelCls}>
            {n.can.reject || n.can.reopen ? 'Comment (needed to send it back)' : 'Comment (optional)'}
            <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {n.can.agree && (
              <button type="button" disabled={busy} onClick={() => act('agree', { comment: comment || undefined })} className={primaryBtn}>
                Agree the corrective action
              </button>
            )}
            {n.can.reject && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('reject', { reason: comment })} className={secondaryBtn}>
                Not accepted, send back
              </button>
            )}
            {n.can.ready && (
              <button type="button" disabled={busy} onClick={() => act('ready', { comment: comment || undefined })} className={primaryBtn}>
                Put right, ready to verify
              </button>
            )}
            {n.can.close && (
              <button type="button" disabled={busy} onClick={() => act('close', { comment: comment || undefined })} className={primaryBtn}>
                Verified on site, close it
              </button>
            )}
            {n.can.reopen && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act('reopen', { reason: comment })} className={secondaryBtn}>
                Not put right yet
              </button>
            )}
            {n.can.void && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => confirm(`Void ${n.number}?`) && act('void', { reason: comment })} className={secondaryBtn}>
                Void
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {n.events.map((e) => (
          <li key={e.id}>
            {formatDateTime(e.createdAt)} · {e.actor.fullName} · {STATUS[e.toStatus].label}
            {e.comment && ` — ${e.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="NCR" entityId={n.id} />
      </div>
    </div>
  );
}

/** Register QHSE "Non-conformance reports" (Required: Yes). Setjeka or a
 * design consultant raises an NCR to the contractor; the contractor answers
 * with the root cause and corrective action; the raiser agrees it, verifies
 * the fix on site and closes it. */
export function NcrPanel({ projectId }: { projectId: string }) {
  const { authedFetch, user } = useAuth();
  const params = useSearchParams();
  const [rows, setRows] = useState<Ncr[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('ncr'));
  const [raising, setRaising] = useState(Boolean(params.get('fromInspection') || params.get('fromTest') || params.get('fromHiddenWork')));
  const [form, setForm] = useState({ title: '', description: '', kind: 'WORKMANSHIP' as Kind, severity: 'MINOR' as Severity, location: '', assigneeId: '', dueDate: '', inspectionId: params.get('fromInspection') ?? '', testResultId: params.get('fromTest') ?? '', hiddenWorkId: params.get('fromHiddenWork') ?? '' });
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Ncr[]>(`/projects/${projectId}/ncrs`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Failed to load the NCRs.')));
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => {});
  }, [authedFetch, projectId]);

  // Raised from a failed inspection: start from what it found.
  useEffect(() => {
    const id = params.get('fromInspection');
    if (!id) return;
    authedFetch<{ title: string; location: string | null; summary: string | null; number: string }>(`/projects/${projectId}/inspections/${id}`)
      .then((i) => setForm((f) => ({ ...f, title: f.title || i.title, location: f.location || (i.location ?? ''), description: f.description || `Found at inspection ${i.number}${i.summary ? `: ${i.summary}` : '.'}` })))
      .catch(() => {});
  }, [authedFetch, params, projectId]);

  // Raised from a failed test: what failed, against what.
  useEffect(() => {
    const id = params.get('fromTest');
    if (!id) return;
    authedFetch<{ number: string; title: string; location: string | null; value: number | null; criterion: { code: string; name: string; unit: string | null }; contractor: { id: string } | null }>(`/projects/${projectId}/quality/tests/${id}`)
      .then((t) => {
        const assignee = members.find((m) => m.role === 'CONTRACTOR' && t.contractor && (m as Member & { contractorId?: string | null }).contractorId === t.contractor.id);
        setForm((f) => ({
          ...f,
          kind: 'MATERIAL',
          assigneeId: f.assigneeId || (assignee?.id ?? ''),
          title: f.title || `${t.criterion.name} failed: ${t.title}`,
          location: f.location || (t.location ?? ''),
          description: f.description || `Test ${t.number} (${t.criterion.code}) failed${t.value != null ? ` at ${t.value}${t.criterion.unit ? ` ${t.criterion.unit}` : ''}` : ''}.`,
        }));
      })
      .catch(() => {});
  }, [authedFetch, params, projectId, members]);

  // Raised from hidden work covered before sign-off.
  useEffect(() => {
    const id = params.get('fromHiddenWork');
    if (!id) return;
    authedFetch<{ number: string; title: string; location: string | null; decisionComment: string | null; contractor: { id: string } | null }>(`/projects/${projectId}/hidden-works/${id}`)
      .then((h) => {
        const assignee = members.find((m) => m.role === 'CONTRACTOR' && h.contractor && (m as Member & { contractorId?: string | null }).contractorId === h.contractor.id);
        setForm((f) => ({
          ...f,
          assigneeId: f.assigneeId || (assignee?.id ?? ''),
          title: f.title || `Covered before sign-off: ${h.title}`,
          location: f.location || (h.location ?? ''),
          description: f.description || `${h.number} was covered before it was inspected${h.decisionComment ? `: ${h.decisionComment}` : '.'} Open it up for inspection, or show by other means that it conforms.`,
        }));
      })
      .catch(() => {});
  }, [authedFetch, params, projectId, members]);

  const contractors = members.filter((m) => m.role === 'CONTRACTOR');
  const mineAsContractor = members.some((m) => m.userId === user?.id && m.role === 'CONTRACTOR');

  async function raise(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const n = await authedFetch<Ncr>(`/projects/${projectId}/ncrs`, {
        method: 'POST',
        body: { ...form, title: form.title.trim(), description: form.description.trim(), location: form.location.trim() || undefined, dueDate: form.dueDate || undefined, inspectionId: form.inspectionId || undefined, testResultId: form.testResultId || undefined, hiddenWorkId: form.hiddenWorkId || undefined },
      });
      setRows((r) => [n, ...(r ?? [])]);
      setRaising(false);
      setSelectedId(n.id);
    } catch (e2) {
      setError(err(e2, 'Could not raise the NCR.'));
    }
  }

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  if (selected) return <NcrDetail projectId={projectId} n={selected} onBack={() => setSelectedId(null)} onChanged={(x) => setRows((r) => (r ?? []).map((y) => (y.id === x.id ? x : y)))} />;

  const shown = (rows ?? []).filter((r) => filter === 'all' || (r.status !== 'CLOSED' && r.status !== 'VOID'));

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ShieldAlert size={16} className="text-amber-600" /> Non-conformance reports
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {mineAsContractor
                ? 'Work found not to conform, issued to you. Give the root cause and how you will put it right; once agreed, fix it and mark it ready to verify.'
                : 'Raise an NCR when work or materials do not conform, often from a failed inspection. The contractor answers with the root cause and corrective action; you agree it, verify the fix on site and close it.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Show" className={`${selectCls} h-9 w-32`} value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
            {!mineAsContractor && !raising && (
              <button type="button" onClick={() => setRaising(true)} className={secondaryBtn}>
                <Plus size={14} /> Raise an NCR
              </button>
            )}
          </div>
        </div>

        {raising && (
          <form onSubmit={raise} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <label className={`${labelCls} sm:col-span-2`}>
              What does not conform
              <input className={`${inputCls} mt-0.5 w-full`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Layerworks below specified compaction" />
            </label>
            <div className={labelCls}>
              Type
              <Select className={`${selectCls} mt-0.5 w-full`} value={form.kind} onChange={(v) => setForm({ ...form, kind: v as Kind })} options={(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k] }))} aria-label="Type" />
            </div>
            <div className={labelCls}>
              Severity
              <Select className={`${selectCls} mt-0.5 w-full`} value={form.severity} onChange={(v) => setForm({ ...form, severity: v as Severity })} options={(Object.keys(SEVERITY) as Severity[]).map((k) => ({ value: k, label: SEVERITY[k].label }))} aria-label="Severity" />
            </div>
            <label className={`${labelCls} sm:col-span-4`}>
              Description
              <textarea aria-label="What was found" className={`${textareaCls} mt-0.5`} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was found, against which drawing or specification clause" />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Where
              <input className={`${inputCls} mt-0.5 w-full`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
            <div className={labelCls}>
              Issued to
              <Select className={`${selectCls} mt-0.5 w-full`} value={form.assigneeId} onChange={(v) => setForm({ ...form, assigneeId: v })} options={[{ value: '', label: contractors.length ? 'Choose…' : 'No contractor on the team' }, ...contractors.map((m) => ({ value: m.id, label: memberName(m) }))]} aria-label="Issued to" />
            </div>
            <label className={labelCls}>
              Answer by
              <DateInput className={`${inputCls} mt-0.5 w-full`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim() || !form.description.trim() || !form.assigneeId} className={primaryBtn}>
                Raise and issue
              </button>
              <button type="button" onClick={() => setRaising(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'open' ? 'No open NCRs.' : 'No NCRs on this project.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => setSelectedId(n.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{n.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                  <span className="block text-xs text-slate-500">
                    {KIND[n.kind]} · <span className={SEVERITY[n.severity].tone}>{SEVERITY[n.severity].label}</span>
                    {n.assignee && ` · ${memberName(n.assignee as Member)}`}
                    {n.dueDate && n.status === 'OPEN' && ` · answer by ${fmtDay(n.dueDate)}`}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[n.status].tone}`}>{STATUS[n.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
