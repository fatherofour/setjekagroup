'use client';

import { useMemo } from 'react';
import { Plus, Milestone, ChevronRight } from 'lucide-react';
import type { useScheduleData } from './useScheduleData';
import { buildActivityTree, formatDate, assigneeLabel, STATUS_DOT, STATUS_LABEL, PRIORITY_BADGE } from './scheduleTypes';

export function ScheduleGridView({
  data,
  onSelect,
  onAddChild,
}: {
  data: ReturnType<typeof useScheduleData>;
  onSelect: (activityId: string) => void;
  onAddChild: (parentId: string | null) => void;
}) {
  const { activities, dependencies } = data;
  const rows = useMemo(() => buildActivityTree(activities ?? []), [activities]);
  const predecessorsOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const dep of dependencies ?? []) {
      const activity = (activities ?? []).find((a) => a.id === dep.predecessorId);
      const label = `${activity?.name ?? '?'} (${dep.type})`;
      map.set(dep.successorId, map.has(dep.successorId) ? `${map.get(dep.successorId)}, ${label}` : label);
    }
    return map;
  }, [dependencies, activities]);

  if (activities === null) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <th className="px-3 py-2 font-medium">Activity</th>
            <th className="px-3 py-2 font-medium">Start</th>
            <th className="px-3 py-2 font-medium">End</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">%</th>
            <th className="px-3 py-2 font-medium">Predecessors</th>
            <th className="px-3 py-2 font-medium">Assigned</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-400">
                No activities yet.
              </td>
            </tr>
          )}
          {rows.map(({ activity, depth }) => (
            <tr
              key={activity.id}
              onClick={() => onSelect(activity.id)}
              className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40 ${
                activity.isCriticalPath ? 'bg-red-50/40 dark:bg-red-950/10' : ''
              }`}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
                  <ChevronRight size={12} className="shrink-0 text-transparent" />
                  {activity.activityType === 'MILESTONE' ? (
                    <Milestone size={14} className="shrink-0 text-amber-500" />
                  ) : (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[activity.status]}`} />
                  )}
                  <span className="truncate font-medium text-slate-800 dark:text-slate-100">{activity.name}</span>
                  {activity.isCriticalPath && (
                    <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                      CP
                    </span>
                  )}
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[activity.priority]}`}>
                    {activity.priority}
                  </span>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{formatDate(activity.startDate)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{formatDate(activity.endDate)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                {activity.activityType === 'MILESTONE' ? '—' : `${activity.durationDays}d`}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{activity.percentComplete}%</td>
              <td className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400" title={predecessorsOf.get(activity.id)}>
                {predecessorsOf.get(activity.id) ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{assigneeLabel(activity) ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[activity.status]}`} />
                  {STATUS_LABEL[activity.status]}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(activity.id);
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-slate-700"
                  aria-label={`Add sub-activity under ${activity.name}`}
                >
                  <Plus size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
        <button
          onClick={() => onAddChild(null)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
        >
          <Plus size={14} />
          Add activity
        </button>
      </div>
    </div>
  );
}
