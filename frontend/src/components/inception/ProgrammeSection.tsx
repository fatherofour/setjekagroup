'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, GanttChart } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';

interface Activity {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  activityType: 'TASK' | 'MILESTONE';
  status: string;
  isCriticalPath: boolean;
}

/** PROCSA PM 1.8 "Prepare, co-ordinate and monitor a project initiation
 * programme" — generates the Stage 1 activities into the project's
 * Schedule (with its critical-path engine) for the PM to adjust there. */
export function ProgrammeSection({ projectId, onChange }: { projectId: string; onChange?: () => void }) {
  const { authedFetch, user } = useAuth();
  const internal = !user || user.accountType === 'INTERNAL' || user.role === 'ADMIN';
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    authedFetch<Activity[]>(`/projects/${projectId}/schedule/activities`)
      .then(setActivities)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the schedule.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/initiation-programme`, { method: 'POST', body: { startDate: start } });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate the programme.');
    } finally {
      setBusy(false);
    }
  }

  const stage1 = activities?.filter((a) => a.name.startsWith('Stage 1 — ')) ?? [];

  return (
    <div className={cardClass}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <CalendarRange size={14} />
        Project initiation programme <span className="font-normal text-slate-400">· PROCSA PM 1.8</span>
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        The Stage 1 activities, linked finish-to-start on the project schedule. Generate the template once, then adjust durations, links and assignees in Schedule.
      </p>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {activities === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : stage1.length === 0 && !internal ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">The Project Manager hasn&apos;t set up the initiation programme yet.</p>
      ) : stage1.length === 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className={labelClass} htmlFor="prog-start">
              Programme starts
            </label>
            <input id="prog-start" type="date" className={`${inputClass} w-44`} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <button type="button" disabled={busy} onClick={generate} className={primaryButton}>
            {busy ? 'Generating…' : 'Generate Stage 1 programme'}
          </button>
          {activities.length > 0 && <p className="w-full text-xs text-slate-500">This project already has {activities.length} other schedule activities; the template is added alongside them.</p>}
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {stage1.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${a.isCriticalPath ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`} title={a.isCriticalPath ? 'Critical path' : undefined} />
                <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">{a.name.replace('Stage 1 — ', '')}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {new Date(a.startDate).toLocaleDateString()}
                  {a.activityType === 'TASK' && ` → ${new Date(a.endDate).toLocaleDateString()}`}
                </span>
              </li>
            ))}
          </ul>
          <Link href={`/projects/${projectId}/schedule`} className={`${secondaryButton} mt-3`}>
            <GanttChart size={14} />
            Open in Schedule
          </Link>
        </>
      )}
    </div>
  );
}
