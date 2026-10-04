'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { CommentThread } from './CommentThread';

interface Row {
  kind: 'NOTE' | 'MEETING';
  id: string;
  title: string;
  owner: string | null;
  raisedBy: string | null;
  dueDate: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  open: boolean;
  source: string | null;
  link: string;
  createdAt: string;
}

const PRIORITY_TONE = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-blue-700 dark:text-blue-300',
  HIGH: 'text-amber-700 dark:text-amber-300',
  CRITICAL: 'text-red-600',
} as const;

/** Register COL "Action register": every action on the project in one place
 * — actions left as notes on any record, and meeting action items — plus
 * general notes on the project. */
export function ActionRegister({ projectId }: { projectId: string }) {
  const { authedFetch, user } = useAuth();
  const [data, setData] = useState<{ rows: Row[]; summary: { open: number; overdue: number; done: number } } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';

  const load = useCallback(() => {
    authedFetch<{ rows: Row[]; summary: { open: number; overdue: number; done: number } }>(`/projects/${projectId}/actions`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load actions.'));
  }, [authedFetch, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(r: Row) {
    if (r.kind !== 'NOTE') return;
    try {
      await authedFetch(`/me/notes/${r.id}/action`, { method: 'PATCH', body: { status: r.open ? 'DONE' : 'OPEN' } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Only the person the action is for, or its author, can change it.');
    }
  }

  const rows = (data?.rows ?? []).filter((r) => showDone || r.open);
  const now = new Date();

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ListChecks size={15} />
              Action register
            </h2>
            <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
              Actions given as notes on any record (RFIs, documents, issues, variations…) and action items from meetings. To add one, leave a note for someone and tick &ldquo;Make it an action&rdquo;.
            </p>
          </div>
          {data && (
            <p className="text-xs text-slate-500">
              <strong className="text-slate-900 dark:text-slate-100">{data.summary.open}</strong> open
              {data.summary.overdue > 0 && (
                <>
                  {' · '}
                  <strong className="text-red-600">{data.summary.overdue}</strong> overdue
                </>
              )}
              {' · '}
              {data.summary.done} done
            </p>
          )}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <label className="mt-3 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-emerald-600" />
          Show completed
        </label>
        {data === null ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No {showDone ? '' : 'open '}actions on this project.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="w-8 py-2" />
                  <th className="py-2 pr-2 font-medium">Action</th>
                  <th className="py-2 pr-2 font-medium">Owner</th>
                  <th className="py-2 pr-2 font-medium">Due</th>
                  <th className="py-2 pr-2 font-medium">Priority</th>
                  <th className="py-2 font-medium">From</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overdue = r.open && r.dueDate && new Date(r.dueDate) < now;
                  return (
                    <tr key={`${r.kind}-${r.id}`} className="border-b border-slate-100 align-top dark:border-slate-800">
                      <td className="py-2">
                        {r.kind === 'NOTE' ? (
                          <button type="button" aria-label={r.open ? 'Mark done' : 'Reopen'} onClick={() => toggle(r)} className="text-slate-400 hover:text-emerald-600">
                            {r.open ? <Circle size={16} /> : <CheckCircle2 size={16} className="text-emerald-600" />}
                          </button>
                        ) : r.open ? (
                          <Circle size={16} className="text-slate-300" />
                        ) : (
                          <CheckCircle2 size={16} className="text-emerald-600" />
                        )}
                      </td>
                      <td className={`py-2 pr-2 ${r.open ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>
                        {r.title}
                        {r.raisedBy && <span className="block text-[11px] text-slate-400">from {r.raisedBy}</span>}
                      </td>
                      <td className="py-2 pr-2 text-xs text-slate-600 dark:text-slate-300">{r.owner ?? '—'}</td>
                      <td className={`py-2 pr-2 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
                      <td className={`py-2 pr-2 text-xs ${r.priority ? PRIORITY_TONE[r.priority] : 'text-slate-400'}`}>{r.priority ? r.priority.toLowerCase() : '—'}</td>
                      <td className="py-2 text-xs">
                        <Link href={r.link} className="text-emerald-700 hover:underline dark:text-emerald-400">
                          {r.source ?? 'Open'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!internal && <p className="mt-3 text-xs text-slate-400">You can mark done the actions given to you.</p>}
      </div>

      <div className="h-fit rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <CommentThread projectId={projectId} entityType="PROJECT" entityId={projectId} title="Project notes" />
      </div>
    </div>
  );
}
