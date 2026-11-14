'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { formatRate } from '@/lib/commercial';

interface Summary {
  currency: string;
  budgetLocked: boolean;
  totals: { revisedBudget: number; forecastFinal: number };
  contingency: { original: number; remaining: number; source?: 'SET' | 'PROJECT_PCT'; pct?: number | null };
  projectedFinalCost: number;
}

/** The project's money as the cost report has it, beside the project value
 * on the details card (critique M-05), so the two never read as rival
 * figures: the value is what the client pays, the budget is what the work is
 * planned to cost. Setjeka's staff only: it's Setjeka's own control figure. */
export function BudgetAtAGlance({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    authedFetch<Summary>(`/projects/${projectId}/commercial/summary`).then(setS).catch(() => setS(null));
  }, [projectId, authedFetch]);
  if (!s || s.totals.revisedBudget <= 0) return null;
  const cur = s.currency;
  return (
    <div className="col-span-full rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
      <span className="font-medium text-slate-800 dark:text-slate-100">Cost report:</span> {s.budgetLocked ? 'locked' : 'draft'} budget {formatRate(s.totals.revisedBudget, cur)} · projected final cost {formatRate(s.projectedFinalCost, cur)} · contingency{' '}
      {formatRate(s.contingency.remaining, cur)} left of {formatRate(s.contingency.original, cur)}
      {s.contingency.source === 'PROJECT_PCT' && ` (${s.contingency.pct ?? 0}% of the budget)`} ·{' '}
      <Link href={`/projects/${projectId}?tab=commercial`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        Open Commercial
      </Link>
    </div>
  );
}
