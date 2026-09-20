'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X, Trash2, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from './CommentThread';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

interface ChecklistItem {
  text: string;
  done: boolean;
}

interface ProjectMemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  checklist: ChecklistItem[];
  assignedTo: ProjectMemberLite | null;
}

const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done', BLOCKED: 'Blocked' };
const STATUS_DOT: Record<TaskStatus, string> = { TODO: 'bg-slate-400', IN_PROGRESS: 'bg-blue-500', DONE: 'bg-emerald-500', BLOCKED: 'bg-red-500' };
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

function TaskDetailPanel({
  projectId,
  task,
  members,
  onClose,
  onChanged,
}: {
  projectId: string;
  task: Task;
  members: ProjectMemberLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    assignedToId: task.assignedTo?.id ?? '',
  });
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist ?? []);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(overrideChecklist?: ChecklistItem[]) {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/tasks/${task.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          status: form.status,
          dueDate: form.dueDate || null,
          assignedToId: form.assignedToId || null,
          checklist: overrideChecklist ?? checklist,
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    await authedFetch(`/projects/${projectId}/tasks/${task.id}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  function toggleChecklistItem(index: number) {
    const next = checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    setChecklist(next);
    save(next);
  }

  function addChecklistItem() {
    if (!newItem.trim()) return;
    const next = [...checklist, { text: newItem.trim(), done: false }];
    setChecklist(next);
    setNewItem('');
    save(next);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit task</h2>
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
              onChange={(v) => setForm({ ...form, status: v as TaskStatus })}
              options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <Select
              className={inputClass}
              value={form.assignedToId}
              onChange={(v) => setForm({ ...form, assignedToId: v })}
              options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
            />
          </div>
          <button
            onClick={() => save()}
            disabled={saving}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Checklist</h3>
          <ul className="mb-2 space-y-1">
            {checklist.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <button onClick={() => toggleChecklistItem(i)} className="text-slate-400 hover:text-emerald-700">
                  {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
                <span className={item.done ? 'flex-1 text-slate-400 line-through' : 'flex-1 text-slate-700 dark:text-slate-200'}>{item.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              className={`${inputClass} flex-1`}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
              placeholder="Add checklist item"
            />
            <button onClick={addChecklistItem} className="rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
              Add
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CommentThread projectId={projectId} entityType="TASK" entityId={task.id} />
        </div>

        <button onClick={remove} className="mt-4 flex items-center gap-1 self-start text-xs font-medium text-red-600 hover:text-red-700">
          <Trash2 size={13} />
          Delete task
        </button>
      </div>
    </div>
  );
}

export function ProjectTasksPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<ProjectMemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = () => {
    authedFetch<Task[]>(`/projects/${projectId}/tasks`)
      .then(setTasks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load tasks.'));
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
      await authedFetch(`/projects/${projectId}/tasks`, { method: 'POST', body: { title: title.trim(), assignedToId: assignedToId || undefined } });
      setTitle('');
      setAssignedToId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add task.');
    } finally {
      setSaving(false);
    }
  }

  const openTask = tasks?.find((t) => t.id === openTaskId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Tasks</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {tasks === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No tasks yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {tasks.map((t) => (
            <li key={t.id}>
              <button onClick={() => setOpenTaskId(t.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status]}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{t.title}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span>
                <span className="shrink-0 text-xs text-slate-400">{memberLabel(t.assignedTo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title" className={`${inputClass} flex-1`} />
        <Select
          value={assignedToId}
          onChange={setAssignedToId}
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

      {openTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={openTask}
          members={members}
          onClose={() => setOpenTaskId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
