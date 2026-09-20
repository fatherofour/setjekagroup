'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Milestone } from 'lucide-react';
import type { useScheduleData } from './useScheduleData';
import type { ScheduleActivity } from './scheduleTypes';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function activityDaySpan(activity: ScheduleActivity): string[] {
  const days: string[] = [];
  const cursor = new Date(activity.startDate);
  const end = new Date(activity.endDate);
  while (cursor.getTime() <= end.getTime()) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function ScheduleCalendarView({ data, onSelect }: { data: ReturnType<typeof useScheduleData>; onSelect: (activityId: string) => void }) {
  const { activities } = data;
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleActivity[]>();
    for (const activity of activities ?? []) {
      for (const key of activityDaySpan(activity)) {
        const bucket = map.get(key);
        if (bucket) bucket.push(activity);
        else map.set(key, [activity]);
      }
    }
    return map;
  }, [activities]);

  if (activities === null) return <p className="text-sm text-slate-400">Loading…</p>;

  const year = monthCursor.getUTCFullYear();
  const month = monthCursor.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = dayKey(new Date());

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setMonthCursor(new Date(Date.UTC(year, month - 1, 1)))}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setMonthCursor(new Date(Date.UTC(year, month + 1, 1)))}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-400 dark:bg-slate-900 dark:text-slate-500">
            {label}
          </div>
        ))}
        {cells.map((date, i) => {
          const key = date ? dayKey(date) : `blank-${i}`;
          const dayActivities = date ? (byDay.get(dayKey(date)) ?? []) : [];
          return (
            <div key={key} className="min-h-[92px] bg-white p-1.5 dark:bg-slate-900">
              {date && (
                <>
                  <span
                    className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      dayKey(date) === today ? 'bg-emerald-700 font-semibold text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {date.getUTCDate()}
                  </span>
                  <div className="space-y-0.5">
                    {dayActivities.slice(0, 3).map((activity) => (
                      <button
                        key={activity.id}
                        onClick={() => onSelect(activity.id)}
                        title={activity.name}
                        className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] ${
                          activity.isCriticalPath
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}
                      >
                        {activity.activityType === 'MILESTONE' && <Milestone size={9} className="shrink-0" />}
                        <span className="truncate">{activity.name}</span>
                      </button>
                    ))}
                    {dayActivities.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{dayActivities.length - 3} more</p>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
