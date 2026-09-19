'use client';

import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoonWidget({ icon: Icon, title, description }: Props) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
    </div>
  );
}
