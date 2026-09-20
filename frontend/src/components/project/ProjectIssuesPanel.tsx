'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from './CommentThread';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';

interface ProjectMemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

interface Issue {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  impact: string | null;
  status: IssueStatus;
  resolutionNotes: string | null;
  dueDate: string | null;
  owner: ProjectMemberLite | null;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  ESCALATED: 'Escalated',
};
const STATUS_DOT: Record<IssueStatus, string> = {
  OPEN: 'bg-red-500',
  IN_PROGRESS: 'bg-blue-500',
  RESOLVED: 'bg-emerald-500',
  CLOSED: 'bg-slate-400',
  ESCALATED: 'bg-amber-500',
};
const PRIORITY_BADGE: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  MEDIUM: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  CRITICAL: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function memberLabel(m: ProjectMemberLite | null): string {
  if (!m) return 'Unassigned';
  return m.user?.fullName ?? m.externalName ?? 'Unassigned';
}

function IssueDetailPanel({
  projectId,
  issue,
  members,
  onClose,
  onChanged,
}: {
  projectId: string;
  issue: Issue;
  members: ProjectMemberLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState({
    title: issue.title,
    description: issue.description ?? '',
    priority: issue.priority,
    impact: issue.impact ?? '',
    status: issue.status,
    resolutionNotes: issue.resolutionNotes ?? '',
    dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : '',
    ownerId: issue.owner?.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/issues/${issue.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          impact: form.impact || null,
          status: form.status,
          resolutionNotes: form.resolutionNotes || null,
          dueDate: form.dueDate || null,
          ownerId: form.ownerId || null,
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save issue.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete issue "${issue.title}"?`)) return;
    await authedFetch(`/projects/${projectId}/issues/${issue.id}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit issue</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="space-y-3">
          <input className={`${inputClass} h-9 w-full`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea
            className="h-16 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              className={inputClass}
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v as Priority })}
              options={Object.keys(PRIORITY_BADGE).map((value) => ({ value, label: value }))}
            />
            <Select
              className={inputClass}
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as IssueStatus })}
              options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <input
            className={`${inputClass} w-full`}
            placeholder="Impact (e.g. delays plastering by 2 days)"
            value={form.impact}
            onChange={(e) => setForm({ ...form, impact: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <Select
              className={inputClass}
              value={form.ownerId}
              onChange={(v) => setForm({ ...form, ownerId: v })}
              options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
            />
          </div>
          <textarea
            className="h-14 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="Resolution notes"
            value={form.resolutionNotes}
            onChange={(e) => setForm({ ...form, resolutionNotes: e.target.value })}
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CommentThread projectId={projectId} entityType="ISSUE" entityId={issue.id} />
        </div>

        <button onClick={remove} className="mt-4 flex items-center gap-1 self-start text-xs font-medium text-red-600 hover:text-red-700">
          <Trash2 size={13} />
          Delete issue
        </button>
      </div>
    </div>
  );
}

export function ProjectIssuesPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [members, setMembers] = useState<ProjectMemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);

  const load = () => {
    authedFetch<Issue[]>(`/projects/${projectId}/issues`)
      .then(setIssues)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load issues.'));
  };

  useEffect(() => {
    load();
    authedFetch<ProjectMemberLite[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/issues`, { method: 'POST', body: { title: title.trim(), ownerId: ownerId || undefined } });
      setTitle('');
      setOwnerId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add issue.');
    } finally {
      setSaving(false);
    }
  }

  const openIssue = issues?.find((i) => i.id === openIssueId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Issues</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {issues === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : issues.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No issues logged yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {issues.map((i) => (
            <li key={i.id}>
              <button onClick={() => setOpenIssueId(i.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[i.status]}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{i.title}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[i.priority]}`}>{i.priority}</span>
                <span className="shrink-0 text-xs text-slate-400">{memberLabel(i.owner)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New issue title" className={`${inputClass} flex-1`} />
        <Select
          value={ownerId}
          onChange={setOwnerId}
          className={inputClass}
          options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
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

      {openIssue && (
        <IssueDetailPanel
          projectId={projectId}
          issue={openIssue}
          members={members}
          onClose={() => setOpenIssueId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
