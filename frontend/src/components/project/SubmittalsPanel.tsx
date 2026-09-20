'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from './CommentThread';

type SubmittalStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REVISE_AND_RESUBMIT' | 'REJECTED';

interface MemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

interface Submittal {
  id: string;
  submittalNumber: string;
  title: string;
  specSection: string | null;
  submittalType: string | null;
  status: SubmittalStatus;
  dueDate: string | null;
  submittedBy: MemberLite | null;
  reviewer: MemberLite | null;
}

interface StatusHistoryEntry {
  id: string;
  previousStatus: string;
  newStatus: string;
  comment: string | null;
  changedAt: string;
  changedBy: { fullName: string };
}

const STATUS_LABEL: Record<SubmittalStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  APPROVED_WITH_COMMENTS: 'Approved with Comments',
  REVISE_AND_RESUBMIT: 'Revise & Resubmit',
  REJECTED: 'Rejected',
};
const STATUS_DOT: Record<SubmittalStatus, string> = {
  SUBMITTED: 'bg-slate-400',
  UNDER_REVIEW: 'bg-blue-500',
  APPROVED: 'bg-emerald-500',
  APPROVED_WITH_COMMENTS: 'bg-emerald-500',
  REVISE_AND_RESUBMIT: 'bg-amber-500',
  REJECTED: 'bg-red-500',
};

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function memberLabel(m: MemberLite | null): string {
  if (!m) return '—';
  return m.user?.fullName ?? m.externalName ?? '—';
}

function SubmittalDetailPanel({
  projectId,
  submittal,
  members,
  onClose,
  onChanged,
}: {
  projectId: string;
  submittal: Submittal;
  members: MemberLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState({
    title: submittal.title,
    specSection: submittal.specSection ?? '',
    submittalType: submittal.submittalType ?? '',
    dueDate: submittal.dueDate ? submittal.dueDate.slice(0, 10) : '',
    submittedById: submittal.submittedBy?.id ?? '',
    reviewerId: submittal.reviewer?.id ?? '',
  });
  const [history, setHistory] = useState<StatusHistoryEntry[] | null>(null);
  const [statusComment, setStatusComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = () => {
    authedFetch<StatusHistoryEntry[]>(`/projects/${projectId}/submittals/${submittal.id}/history`).then(setHistory).catch(() => {});
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittal.id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/submittals/${submittal.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          specSection: form.specSection || null,
          submittalType: form.submittalType || null,
          dueDate: form.dueDate || null,
          submittedById: form.submittedById || null,
          reviewerId: form.reviewerId || null,
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save submittal.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: SubmittalStatus) {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/submittals/${submittal.id}/status`, {
        method: 'PATCH',
        body: { status, comment: statusComment.trim() || undefined },
      });
      setStatusComment('');
      loadHistory();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change status.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{submittal.submittalNumber}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="space-y-3">
          <input className={`${inputClass} h-9 w-full`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Spec section" value={form.specSection} onChange={(e) => setForm({ ...form, specSection: e.target.value })} />
            <input className={inputClass} placeholder="Type" value={form.submittalType} onChange={(e) => setForm({ ...form, submittalType: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              className={inputClass}
              value={form.submittedById}
              onChange={(v) => setForm({ ...form, submittedById: v })}
              options={[{ value: '', label: '— Submitted by —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
            />
            <Select
              className={inputClass}
              value={form.reviewerId}
              onChange={(v) => setForm({ ...form, reviewerId: v })}
              options={[{ value: '', label: '— Reviewer —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
            />
          </div>
          <input type="date" className={`${inputClass} w-full`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <button onClick={save} disabled={saving} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Change status</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className={`${inputClass} flex-1`}
              value={submittal.status}
              onChange={(v) => changeStatus(v as SubmittalStatus)}
              options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <input
            className={`${inputClass} mt-2 w-full`}
            placeholder="Comment for this status change (optional)"
            value={statusComment}
            onChange={(e) => setStatusComment(e.target.value)}
          />

          <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Status history</p>
          {!history || history.length === 0 ? (
            <p className="text-xs text-slate-400">No status changes recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {STATUS_LABEL[h.previousStatus as SubmittalStatus] ?? h.previousStatus} → {STATUS_LABEL[h.newStatus as SubmittalStatus] ?? h.newStatus}
                  </span>
                  <span className="ml-2 text-slate-400">
                    by {h.changedBy.fullName} · {new Date(h.changedAt).toLocaleString()}
                  </span>
                  {h.comment && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{h.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CommentThread projectId={projectId} entityType="SUBMITTAL" entityId={submittal.id} />
        </div>
      </div>
    </div>
  );
}

export function SubmittalsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [submittals, setSubmittals] = useState<Submittal[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    authedFetch<Submittal[]>(`/projects/${projectId}/submittals`)
      .then(setSubmittals)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load submittals.'));
  };

  useEffect(() => {
    load();
    authedFetch<MemberLite[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/submittals`, { method: 'POST', body: { title: title.trim(), reviewerId: reviewerId || undefined } });
      setTitle('');
      setReviewerId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add submittal.');
    } finally {
      setSaving(false);
    }
  }

  const openSubmittal = submittals?.find((s) => s.id === openId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Submittals</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {submittals === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : submittals.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No submittals yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {submittals.map((s) => (
            <li key={s.id}>
              <button onClick={() => setOpenId(s.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
                <span className="shrink-0 text-xs text-slate-400">{s.submittalNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{s.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{memberLabel(s.reviewer)}</span>
                <span className="shrink-0 text-xs text-slate-400">{STATUS_LABEL[s.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New submittal title" className={`${inputClass} flex-1`} />
        <Select
          value={reviewerId}
          onChange={setReviewerId}
          className={inputClass}
          options={[{ value: '', label: '— Reviewer —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <Plus size={13} />
          Add
        </button>
      </form>

      {openSubmittal && (
        <SubmittalDetailPanel projectId={projectId} submittal={openSubmittal} members={members} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}
