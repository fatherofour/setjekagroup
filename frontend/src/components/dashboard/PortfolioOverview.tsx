'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, DollarSign, PieChart } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface Props {
  activeCount: number;
}

interface Totals {
  projects: number;
  withBudget: number;
  revisedBudget: number;
  projectedFinalCost: number;
  health: { RED: number; AMBER: number; GREEN: number };
}

const rand = (n: number) => (n >= 1_000_000 ? `R ${(n / 1_000_000).toFixed(1)}m` : `R ${Math.round(n / 1000)}k`);

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

/** The portfolio's headline figures for Setjeka staff (from /portfolio);
 * outside parties see the project count only. */
export function PortfolioOverview({ activeCount }: Props) {
  const { authedFetch, user } = useAuth();
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  const [t, setT] = useState<Totals | null>(null);
  useEffect(() => {
    if (!internal) return;
    // The light totals call (critique H-06/H-07), not the whole portfolio.
    authedFetch<{ totals: Totals }>('/portfolio/totals')
      .then((p) => setT(p.totals))
      .catch(() => undefined);
  }, [authedFetch, internal]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio overview</h2>
        {internal && (
          <Link href="/portfolio" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Open the portfolio
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatRow icon={Briefcase} label="Active projects" value={String(activeCount)} note={t ? `${t.health.RED} need attention` : undefined} />
        <StatRow icon={DollarSign} label="Total budget" value={t ? rand(t.revisedBudget) : '—'} note={t ? `forecast ${rand(t.projectedFinalCost)}` : internal ? 'Loading' : undefined} />
        <StatRow icon={PieChart} label="With budget set" value={t ? `${t.withBudget} of ${t.projects}` : '—'} />
      </div>
    </div>
  );
}
