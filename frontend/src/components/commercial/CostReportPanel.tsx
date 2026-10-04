'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass } from '@/lib/stage0';
import { formatRate } from '@/lib/commercial';

interface ReportLine {
  costCodeId: string | null;
  code: string | null;
  name: string;
  budget: number;
  approvedVariations: number;
  pendingVariations: number;
  revisedBudget: number;
  committed: number;
  invoiced: number;
  paid: number;
  forecastFinal: number;
  variance: number;
}

export interface CostReport {
  currency: string;
  budgetLocked: boolean;
  lines: ReportLine[];
  totals: Omit<ReportLine, 'costCodeId' | 'code' | 'name'>;
  contingency: { original: number; drawn: number; remaining: number; pendingExposure: number; remainingIfPendingApproved: number };
  projectedFinalCost: number;
  missingFx: string[];
}

const COLS: [keyof ReportLine, string][] = [
  ['budget', 'Budget'],
  ['approvedVariations', 'Approved variations'],
  ['revisedBudget', 'Revised budget'],
  ['committed', 'Committed'],
  ['invoiced', 'Invoiced'],
  ['paid', 'Paid'],
  ['forecastFinal', 'Forecast final'],
  ['variance', 'Variance'],
];

/** Register COM "Cost tracking": budget vs committed vs actual vs forecast
 * by cost code, and the contingency drawn by approved variations. */
export function CostReportPanel({ projectId, version }: { projectId: string; version: number }) {
  const { authedFetch } = useAuth();
  const [report, setReport] = useState<CostReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<CostReport>(`/projects/${projectId}/commercial/summary`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the cost report.'));
  }, [authedFetch, projectId, version]);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!report) return <p className="text-sm text-slate-400">Loading…</p>;

  const cur = report.currency;
  const c = report.contingency;
  const pctLeft = c.original > 0 ? Math.max(0, Math.min(100, (c.remaining / c.original) * 100)) : 0;

  return (
    <div className="space-y-4">
      {report.missingFx.length > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          No exchange rate on file for {report.missingFx.join(', ')}, so those amounts are left out. Add the rate under Cost database → Exchange rates.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs text-slate-500">Revised budget</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatRate(report.totals.revisedBudget, cur)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Original {formatRate(report.totals.budget)} + approved variations {formatRate(report.totals.approvedVariations)}
            {!report.budgetLocked && ' · budget not locked yet'}
          </p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-slate-500">Forecast final cost</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${report.totals.variance < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>{formatRate(report.totals.forecastFinal, cur)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {report.totals.variance < 0 ? `${formatRate(-report.totals.variance)} over the revised budget` : `${formatRate(report.totals.variance)} within budget`} · committed {formatRate(report.totals.committed)} · paid {formatRate(report.totals.paid)}
          </p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-slate-500">Contingency remaining</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${c.remaining < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>{formatRate(c.remaining, cur)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <div className={`h-full rounded-full ${pctLeft < 25 ? 'bg-red-500' : pctLeft < 50 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pctLeft}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            of {formatRate(c.original)} · drawn {formatRate(c.drawn)}
            {c.pendingExposure !== 0 && ` · ${formatRate(c.pendingExposure)} awaiting the client (would leave ${formatRate(c.remainingIfPendingApproved)})`}
          </p>
        </div>
      </div>

      <div className={`${cardClass} overflow-x-auto p-0`}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
              <th className="px-4 py-2.5 font-medium">Cost code</th>
              {COLS.map(([, label]) => (
                <th key={label} className="px-2 py-2.5 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-400">
                  No budget, commitments or variations yet.
                </td>
              </tr>
            ) : (
              report.lines.map((l) => (
                <tr key={l.costCodeId ?? 'none'} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-slate-800 dark:text-slate-100">
                    {l.code && <span className="mr-2 font-mono text-xs text-slate-400">{l.code}</span>}
                    {l.name}
                  </td>
                  {COLS.map(([k]) => (
                    <td key={k} className={`px-2 py-2 text-right tabular-nums ${k === 'variance' && (l[k] as number) < 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>
                      {(l[k] as number) === 0 ? <span className="text-slate-300 dark:text-slate-600">—</span> : formatRate(l[k] as number)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {report.lines.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold dark:bg-slate-800/40">
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">Total ({cur})</td>
                {COLS.map(([k]) => (
                  <td key={k} className={`px-2 py-2 text-right tabular-nums ${k === 'variance' && (report.totals[k as keyof CostReport['totals']] as number) < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>
                    {formatRate(report.totals[k as keyof CostReport['totals']] as number)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Committed is approved and issued purchase orders plus appointment fees; invoiced and paid come from supplier invoices and appointment payments. Forecast final is the higher of the revised budget and what is committed. Setjeka monitors cost here; the QS&apos;s own system remains the record.
      </p>
    </div>
  );
}
