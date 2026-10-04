'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Circle, Send, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';

type CommentEntityType =
  | 'TASK'
  | 'ISSUE'
  | 'SCHEDULE_ACTIVITY'
  | 'DOCUMENT_REVISION'
  | 'RISK'
  | 'RFI'
  | 'SUBMITTAL'
  | 'PROJECT_BRIEF'
  | 'STAGE_DELIVERABLE'
  | 'MEETING'
  | 'VARIATION'
  | 'PROJECT'
  | 'OPPORTUNITY';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Note {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; fullName: string };
  recipient: { id: string; fullName: string } | null;
  isAction: boolean;
  dueDate: string | null;
  priority: Priority | null;
  actionStatus: 'OPEN' | 'DONE' | null;
  completedAt: string | null;
  completedBy: { id: string; fullName: string } | null;
  createdAt: string;
}

const PRIORITY_TONE: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CRITICAL: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const fieldClass =
  'h-8 rounded-md border border-slate-300 bg-white px-2 text-xs shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Notes on a record (Meeting 3 §2.4 — "leave a note", not chat). A note can
 * be addressed to a named person; made into an action, it joins their
 * action list with a due date and priority, and they are alerted. Used on
 * tasks, issues, risks, RFIs, submittals, documents, meetings, variations,
 * the brief, the project itself, and (with `opportunityId`) opportunities. */
export function CommentThread({
  projectId,
  opportunityId,
  entityType,
  entityId,
  title = 'Notes',
}: {
  projectId?: string;
  opportunityId?: string;
  entityType: CommentEntityType;
  entityId: string;
  title?: string;
}) {
  const { authedFetch, user } = useAuth();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [people, setPeople] = useState<{ id: string; fullName: string; role?: string | null }[]>([]);
  const [body, setBody] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [isAction, setIsAction] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';

  const base = opportunityId ? `/opportunities/${opportunityId}/notes` : `/projects/${projectId}/comments`;

  const load = () => {
    const url = opportunityId ? base : `${base}?entityType=${entityType}&entityId=${entityId}`;
    authedFetch<Note[]>(url)
      .then(setNotes)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load notes.'));
  };

  useEffect(() => {
    load();
    authedFetch<{ id: string; fullName: string }[]>(`${base}/people`)
      .then(setPeople)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, opportunityId, entityType, entityId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const note = {
        body: body.trim(),
        recipientId: recipientId || undefined,
        isAction: Boolean(recipientId && isAction),
        dueDate: recipientId && isAction && dueDate ? dueDate : undefined,
        priority: recipientId && isAction ? priority : undefined,
      };
      await authedFetch(base, { method: 'POST', body: opportunityId ? note : { entityType, entityId, ...note } });
      setBody('');
      setIsAction(false);
      setDueDate('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post the note.');
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/projects/${projectId}/comments/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the note.');
    }
  }

  async function setStatus(n: Note, status: 'OPEN' | 'DONE') {
    try {
      await authedFetch(`/me/notes/${n.id}/action`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the action.');
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</h3>
      {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {notes === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">No notes yet. Leave one for someone, or make it an action on their list.</p>
      ) : (
        <ul className="mb-2 space-y-2">
          {notes.map((c) => {
            const canChange = c.isAction && (c.recipient?.id === user?.id || c.authorId === user?.id || internal);
            const done = c.actionStatus === 'DONE';
            return (
              <li key={c.id} className={`group/comment rounded-md px-2.5 py-2 text-xs ${c.isAction ? 'border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{c.author.fullName}</span>
                    {c.recipient && (
                      <span className="inline-flex items-center gap-0.5 text-slate-500">
                        → <UserRound size={11} /> {c.recipient.fullName}
                      </span>
                    )}
                    {c.isAction && (
                      <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>
                        {done ? 'Action done' : 'Action'}
                      </span>
                    )}
                    {c.isAction && c.priority && !done && <span className={`rounded-full px-1.5 py-px text-[10px] ${PRIORITY_TONE[c.priority]}`}>{c.priority.toLowerCase()}</span>}
                    {c.isAction && c.dueDate && !done && <span className={`text-[10px] ${new Date(c.dueDate) < new Date() ? 'font-semibold text-red-600' : 'text-slate-500'}`}>due {new Date(c.dueDate).toLocaleDateString()}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-slate-400">
                    {formatWhen(c.createdAt)}
                    {c.authorId === user?.id && !opportunityId && (
                      <button onClick={() => remove(c.id)} className="opacity-0 transition hover:text-red-600 focus:opacity-100 group-hover/comment:opacity-100" aria-label="Delete note">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </span>
                </div>
                <p className={`whitespace-pre-wrap ${done ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}`}>{c.body}</p>
                {c.isAction && (
                  <div className="mt-1 flex items-center gap-2">
                    {done && c.completedBy && <span className="text-[10px] text-slate-500">Done by {c.completedBy.fullName}{c.completedAt && ` ${new Date(c.completedAt).toLocaleDateString()}`}</span>}
                    {canChange && (
                      <button type="button" onClick={() => setStatus(c, done ? 'OPEN' : 'DONE')} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                        {done ? <Circle size={11} /> : <CheckCircle2 size={11} />}
                        {done ? 'Reopen' : 'Mark done'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-1.5">
        <textarea
          aria-label="Note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a note…"
          rows={2}
          className="h-16 w-full resize-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select
              aria-label="Note for"
              value={recipientId}
              onChange={(v) => {
                setRecipientId(v);
                if (!v) setIsAction(false);
              }}
              options={[{ value: '', label: 'For: everyone' }, ...people.map((p) => ({ value: p.id, label: `For: ${p.fullName}` }))]}
              className={`${fieldClass} w-full`}
            />
          </div>
          {recipientId && (
            <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={isAction} onChange={(e) => setIsAction(e.target.checked)} className="accent-emerald-600" />
              Make it an action
            </label>
          )}
          {recipientId && isAction && (
            <>
              <input aria-label="Due date" type="date" className={fieldClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <div className="w-28">
                <Select
                  aria-label="Priority"
                  value={priority}
                  onChange={(v) => setPriority(v as Priority)}
                  options={(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Priority[]).map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))}
                  className={`${fieldClass} w-full`}
                />
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="ml-auto flex h-8 items-center gap-1 rounded-md bg-emerald-700 px-2.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            <Send size={12} />
            {recipientId ? (isAction ? 'Assign action' : 'Send note') : 'Post note'}
          </button>
        </div>
      </form>
    </div>
  );
}
