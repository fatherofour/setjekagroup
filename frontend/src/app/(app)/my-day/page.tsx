'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ListChecks, MessageSquare, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { clientLink } from '@/lib/portal';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface NoteItem {
  id: string;
  body: string;
  author: { fullName: string };
  dueDate: string | null;
  priority: Priority | null;
  actionStatus: 'OPEN' | 'DONE' | null;
  completedAt: string | null;
  createdAt: string;
  context: string | null;
  projectName: string | null;
  link: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: Priority;
  dueDate: string | null;
  project: { name: string };
  meeting: { id: string; title: string } | null;
  link: string;
}

const PRIORITY_TONE: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CRITICAL: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';

function due(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'font-semibold text-red-600' };
  if (days === 0) return { text: 'due today', tone: 'font-semibold text-amber-700 dark:text-amber-400' };
  if (days === 1) return { text: 'due tomorrow', tone: 'text-amber-700 dark:text-amber-400' };
  return { text: `due ${date.toLocaleDateString()}`, tone: 'text-slate-500' };
}

/** "My Day" (Meeting 3 §2.4): the actions people have given me, notes left
 * for me, and project tasks assigned to me — including meeting actions. */
export default function MyDayPage() {
  const { authedFetch, user } = useAuth();
  const [data, setData] = useState<{ actions: NoteItem[]; notes: NoteItem[]; tasks: TaskItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<{ actions: NoteItem[]; notes: NoteItem[]; tasks: TaskItem[] }>('/me/actions')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your day.'));
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  const open = data?.actions.filter((a) => a.actionStatus === 'OPEN') ?? [];
  const done = data?.actions.filter((a) => a.actionStatus === 'DONE') ?? [];
  const firstName = user?.fullName.split(' ')[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Day{firstName ? ` — ${firstName}` : ''}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {data ? `${open.length} open action${open.length === 1 ? '' : 's'}, ${data.notes.length} note${data.notes.length === 1 ? '' : 's'} for you and ${data.tasks.length} task${data.tasks.length === 1 ? '' : 's'}.` : 'Your actions, notes and tasks.'}
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {data === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`${card} lg:row-span-2`}>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ListChecks size={15} />
              Actions for you
            </h2>
            {open.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">Nothing outstanding. Actions people give you in notes appear here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {open.map((a) => {
                  const d = due(a.dueDate);
                  return (
                    <li key={a.id} className="flex gap-3 py-2.5">
                      <button type="button" aria-label="Mark done" onClick={() => run(() => authedFetch(`/me/notes/${a.id}/action`, { method: 'PATCH', body: { status: 'DONE' } }))} className="mt-0.5 text-slate-300 hover:text-emerald-600">
                        <Circle size={18} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{a.body}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span>from {a.author.fullName}</span>
                          {d && <span className={d.tone}>{d.text}</span>}
                          {a.priority && <span className={`rounded-full px-1.5 py-px text-[10px] ${PRIORITY_TONE[a.priority]}`}>{a.priority.toLowerCase()}</span>}
                          <Link href={clientLink(a.link, user)} className="text-emerald-700 hover:underline dark:text-emerald-400">
                            {[a.projectName, a.context].filter(Boolean).join(' · ') || 'Open'}
                          </Link>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {done.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-500">Done in the last two weeks ({done.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {done.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs">
                      <button type="button" aria-label="Reopen" onClick={() => run(() => authedFetch(`/me/notes/${a.id}/action`, { method: 'PATCH', body: { status: 'OPEN' } }))}>
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      </button>
                      <span className="text-slate-400 line-through">{a.body}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className={card}>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <MessageSquare size={15} />
              Notes for you
            </h2>
            {data.notes.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No new notes.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{n.body}</p>
                      <button type="button" aria-label="Dismiss note" title="Dismiss" onClick={() => run(() => authedFetch(`/me/notes/${n.id}/acknowledge`, { method: 'POST' }))} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                        <X size={14} />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {n.author.fullName} · {new Date(n.createdAt).toLocaleDateString()} ·{' '}
                      <Link href={clientLink(n.link, user)} className="text-emerald-700 hover:underline dark:text-emerald-400">
                        {[n.projectName, n.context].filter(Boolean).join(' · ') || 'Open'}
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={card}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your tasks</h2>
            {data.tasks.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No open tasks assigned to you.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {data.tasks.map((t) => {
                  const d = due(t.dueDate);
                  return (
                    <li key={t.id} className="py-2">
                      <Link href={clientLink(t.link, user)} className="text-sm text-slate-800 hover:underline dark:text-slate-100">
                        {t.title}
                      </Link>
                      <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                        <span>{t.project.name}</span>
                        {t.meeting && <span>from {t.meeting.title}</span>}
                        {d && <span className={d.tone}>{d.text}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
