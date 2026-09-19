'use client';

import { ClipboardList, MessageSquareWarning, ShieldAlert } from 'lucide-react';

function StatRow({ icon: Icon, label }: { icon: typeof ClipboardList; label: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Icon size={14} className="shrink-0" />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">—</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Not tracked yet</span>
      </div>
    </div>
  );
}

export function TodaySnapshot() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Today</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatRow icon={ClipboardList} label="Open tasks" />
        <StatRow icon={MessageSquareWarning} label="Open RFIs" />
        <StatRow icon={ShieldAlert} label="Safety incidents" />
      </div>
    </div>
  );
}
