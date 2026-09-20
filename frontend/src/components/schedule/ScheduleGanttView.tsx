'use client';

import { useMemo } from 'react';
import { Milestone } from 'lucide-react';
import type { useScheduleData } from './useScheduleData';
import { buildActivityTree, type ScheduleActivity } from './scheduleTypes';

const DAY_WIDTH = 26;
const ROW_HEIGHT = 32;
const NAME_COL_WIDTH = 220;

function calendarDayDiff(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

function isWeekendDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function ScheduleGanttView({ data, onSelect }: { data: ReturnType<typeof useScheduleData>; onSelect: (activityId: string) => void }) {
  const { activities, dependencies } = data;
  const rows = useMemo(() => buildActivityTree(activities ?? []), [activities]);

  const { rangeStart, days } = useMemo(() => {
    if (!activities || activities.length === 0) {
      const today = new Date();
      return { rangeStart: today, days: 30 };
    }
    const starts = activities.map((a) => new Date(a.startDate).getTime());
    const ends = activities.map((a) => new Date(a.endDate).getTime());
    const min = new Date(Math.min(...starts));
    min.setUTCDate(min.getUTCDate() - 3);
    const max = new Date(Math.max(...ends));
    max.setUTCDate(max.getUTCDate() + 3);
    return { rangeStart: min, days: Math.max(calendarDayDiff(min, max), 14) };
  }, [activities]);

  function dateToX(dateStr: string): number {
    return calendarDayDiff(rangeStart, new Date(dateStr)) * DAY_WIDTH;
  }

  const monthGroups = useMemo(() => {
    const groups: { label: string; span: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStart);
      d.setUTCDate(d.getUTCDate() + i);
      const label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      if (groups.length > 0 && groups[groups.length - 1].label === label) groups[groups.length - 1].span += 1;
      else groups.push({ label, span: 1 });
    }
    return groups;
  }, [rangeStart, days]);

  if (activities === null) return <p className="text-sm text-slate-400">Loading…</p>;

  const timelineWidth = days * DAY_WIDTH;
  const rowIndexById = new Map(rows.map((r, i) => [r.activity.id, i]));

  const arrows = (dependencies ?? []).flatMap((dep) => {
    const pred = activities.find((a) => a.id === dep.predecessorId);
    const succ = activities.find((a) => a.id === dep.successorId);
    const predRow = rowIndexById.get(dep.predecessorId);
    const succRow = rowIndexById.get(dep.successorId);
    if (!pred || !succ || predRow === undefined || succRow === undefined) return [];

    const predStartX = dateToX(pred.startDate);
    const predEndX = dateToX(pred.endDate) + DAY_WIDTH;
    const succStartX = dateToX(succ.startDate);
    const succEndX = dateToX(succ.endDate) + DAY_WIDTH;
    const predY = predRow * ROW_HEIGHT + ROW_HEIGHT / 2;
    const succY = succRow * ROW_HEIGHT + ROW_HEIGHT / 2;

    const fromX = dep.type === 'SS' || dep.type === 'SF' ? predStartX : predEndX;
    const toX = dep.type === 'FF' || dep.type === 'SF' ? succEndX : succStartX;
    const midX = fromX + (toX >= fromX ? 12 : -12);

    return [
      <path
        key={dep.id}
        d={`M ${fromX} ${predY} H ${midX} V ${succY} H ${toX}`}
        fill="none"
        stroke={succ.isCriticalPath && pred.isCriticalPath ? '#dc2626' : '#94a3b8'}
        strokeWidth={1.5}
        markerEnd="url(#gantt-arrow)"
      />,
    ];
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div style={{ width: NAME_COL_WIDTH + timelineWidth }}>
        {/* Header */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <div
            className="sticky left-0 z-20 flex shrink-0 items-end border-r border-slate-200 bg-white px-3 pb-1 text-xs font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-900"
            style={{ width: NAME_COL_WIDTH }}
          >
            Activity
          </div>
          <div>
            <div className="flex">
              {monthGroups.map((g, i) => (
                <div
                  key={i}
                  className="shrink-0 truncate border-r border-slate-100 px-1 pt-1 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400"
                  style={{ width: g.span * DAY_WIDTH }}
                >
                  {g.label}
                </div>
              ))}
            </div>
            <div className="flex">
              {Array.from({ length: days }, (_, i) => {
                const d = new Date(rangeStart);
                d.setUTCDate(d.getUTCDate() + i);
                return (
                  <div
                    key={i}
                    className={`shrink-0 border-r border-slate-50 pb-1 text-center text-[10px] dark:border-slate-800/50 ${
                      isWeekendDay(d) ? 'bg-slate-50 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'
                    }`}
                    style={{ width: DAY_WIDTH }}
                  >
                    {d.getUTCDate()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {rows.map(({ activity, depth }, i) => (
            <RowLine key={activity.id} activity={activity} depth={depth} isEven={i % 2 === 0} dateToX={dateToX} onSelect={onSelect} />
          ))}
          {rows.length === 0 && <p className="px-3 py-6 text-sm text-slate-400">No activities yet — add one from the Grid view.</p>}

          <svg
            className="pointer-events-none absolute top-0"
            style={{ left: NAME_COL_WIDTH, width: timelineWidth, height: rows.length * ROW_HEIGHT }}
            width={timelineWidth}
            height={rows.length * ROW_HEIGHT}
          >
            <defs>
              <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {arrows}
          </svg>
        </div>
      </div>
    </div>
  );
}

function RowLine({
  activity,
  depth,
  isEven,
  dateToX,
  onSelect,
}: {
  activity: ScheduleActivity;
  depth: number;
  isEven: boolean;
  dateToX: (d: string) => number;
  onSelect: (id: string) => void;
}) {
  const startX = dateToX(activity.startDate);
  const barWidth = Math.max(dateToX(activity.endDate) + DAY_WIDTH - startX, DAY_WIDTH);
  const barColor = activity.isCriticalPath ? 'bg-red-500' : activity.activityType === 'MILESTONE' ? 'bg-amber-500' : 'bg-emerald-600';

  return (
    <div className={`flex ${isEven ? '' : 'bg-slate-50/50 dark:bg-slate-800/20'}`} style={{ height: ROW_HEIGHT }}>
      <button
        onClick={() => onSelect(activity.id)}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 truncate border-r border-slate-100 bg-inherit px-3 text-left text-xs text-slate-700 hover:text-emerald-700 dark:border-slate-800 dark:text-slate-200"
        style={{ width: NAME_COL_WIDTH, paddingLeft: 12 + depth * 14, backgroundColor: 'inherit' }}
      >
        {activity.activityType === 'MILESTONE' && <Milestone size={11} className="shrink-0 text-amber-500" />}
        <span className="truncate">{activity.name}</span>
      </button>
      <div className="relative flex-1">
        {activity.activityType === 'MILESTONE' ? (
          <div
            role="button"
            onClick={() => onSelect(activity.id)}
            className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 cursor-pointer ${barColor}`}
            style={{ left: startX + DAY_WIDTH / 2 - 6 }}
            title={activity.name}
          />
        ) : (
          <div
            role="button"
            onClick={() => onSelect(activity.id)}
            className={`absolute top-1/2 h-4 -translate-y-1/2 cursor-pointer rounded ${barColor} opacity-90 hover:opacity-100`}
            style={{ left: startX, width: barWidth }}
            title={`${activity.name} — ${activity.percentComplete}%`}
          >
            <div className="h-full rounded bg-black/20" style={{ width: `${activity.percentComplete}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
