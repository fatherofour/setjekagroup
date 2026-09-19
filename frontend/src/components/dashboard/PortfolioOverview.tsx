'use client';

import { Briefcase, DollarSign, PieChart } from 'lucide-react';

interface Props {
  activeCount: number;
}

function StatRow({ icon: Icon, label, value, note }: { icon: typeof Briefcase; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Icon size={14} className="shrink-0" />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</span>
        {note && <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{note}</span>}
      </div>
    </div>
  );
}

export function PortfolioOverview({ activeCount }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio overview</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatRow icon={Briefcase} label="Active projects" value={String(activeCount)} />
        <StatRow icon={DollarSign} label="Total budget" value="—" note="Not tracked yet" />
        <StatRow icon={PieChart} label="With budget set" value="—" note="Not tracked yet" />
      </div>
    </div>
  );
}
