'use client';

import { useMemo } from 'react';
import { Milestone } from 'lucide-react';
import type { useScheduleData } from './useScheduleData';
import { STATUS_ORDER, STATUS_LABEL, STATUS_DOT, PRIORITY_BADGE, formatDate, assigneeLabel, type ScheduleActivityStatus } from './scheduleTypes';

export function ScheduleCardView({ data, onSelect }: { data: ReturnType<typeof useScheduleData>; onSelect: (activityId: string) => void }) {
  const { activities } = data;

  const byStatus = useMemo(() => {
    const map = new Map<ScheduleActivityStatus, typeof activities>();
    for (const status of STATUS_ORDER) map.set(status, []);
    for (const activity of activities ?? []) {
      map.get(activity.status)?.push(activity);
    }
    return map;
  }, [activities]);

  if (activities === null) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{STATUS_LABEL[status]}</h3>
            <span className="ml-auto text-xs text-slate-400">{byStatus.get(status)?.length ?? 0}</span>
          </div>
          <div className="space-y-2">
            {(byStatus.get(status) ?? []).map((activity) => (
              <button
                key={activity.id}
                onClick={() => onSelect(activity.id)}
                className={`block w-full rounded-lg border bg-white p-2.5 text-left shadow-sm transition hover:shadow dark:bg-slate-900 ${
                  activity.isCriticalPath ? 'border-red-200 dark:border-red-900' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="mb-1 flex items-start gap-1.5">
                  {activity.activityType === 'MILESTONE' && <Milestone size={12} className="mt-0.5 shrink-0 text-amber-500" />}
                  <span className="text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">{activity.name}</span>
                </div>
                <p className="mb-1.5 text-xs text-slate-400 dark:text-slate-500">
                  {formatDate(activity.startDate)} → {formatDate(activity.endDate)}
                </p>
                {assigneeLabel(activity) && <p className="mb-1.5 truncate text-xs text-slate-500 dark:text-slate-400">{assigneeLabel(activity)}</p>}
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[activity.priority]}`}>{activity.priority}</span>
                  {activity.activityType === 'TASK' && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{activity.percentComplete}%</span>
                  )}
                  {activity.isCriticalPath && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                      Critical
                    </span>
                  )}
                </div>
              </button>
            ))}
            {(byStatus.get(status) ?? []).length === 0 && <p className="px-1 py-2 text-xs text-slate-300 dark:text-slate-600">—</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
