'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface Today {
  tasks: number;
  overdueTasks: number;
  rfis: number;
  overdueRfis: number;
  incidents: number;
}

function StatRow({ icon: Icon, label, value, note, alert }: { icon: typeof ClipboardList; label: string; value: number | null; note?: string; alert?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Icon size={14} className="shrink-0" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value ?? '…'}</span>
        {note && <span className={`text-[11px] ${alert ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>{note}</span>}
      </div>
    </div>
  );
}

/** Open work across the live projects, for Setjeka staff (critique H-06). */
export function TodaySnapshot() {
  const { authedFetch } = useAuth();
  const [t, setT] = useState<Today | null>(null);
  useEffect(() => {
    authedFetch<Today>('/portfolio/today').then(setT).catch(() => undefined);
  }, [authedFetch]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Today, across live projects</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatRow icon={ClipboardList} label="Open tasks" value={t?.tasks ?? null} note={t?.overdueTasks ? `${t.overdueTasks} overdue` : undefined} alert />
        <StatRow icon={MessageSquareWarning} label="Open RFIs" value={t?.rfis ?? null} note={t?.overdueRfis ? `${t.overdueRfis} overdue` : undefined} alert />
        <StatRow icon={ShieldAlert} label="Open safety incidents" value={t?.incidents ?? null} alert />
      </div>
    </div>
  );
}
