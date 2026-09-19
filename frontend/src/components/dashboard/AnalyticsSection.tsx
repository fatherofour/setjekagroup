'use client';

import { BarChart3 } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

const STATUS_ORDER = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];

export function AnalyticsSection({ statusCounts, total }: { statusCounts: Record<string, number>; total: number }) {
  const rows = STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Projects by status</h2>
      </div>
      {rows.length === 0 || total === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No projects yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((status) => {
            const count = statusCounts[status] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">{STATUS_LABEL[status] ?? status}</span>
                  <span className="tabular-nums text-slate-400 dark:text-slate-500">
                    {count} · {pct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
