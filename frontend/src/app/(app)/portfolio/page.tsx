'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Layers } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { projectStageInfo, type ProjectStage } from '@/lib/projectStages';

type Health = 'GREEN' | 'AMBER' | 'RED' | 'NONE';

interface Row {
  id: string;
  name: string;
  projectCode: string | null;
  status: string;
  stage: ProjectStage;
  client: string | null;
  projectManager: string | null;
  currency: string;
  cost: { budgetLocked: boolean; budget: number; contingency: number; revisedBudget: number; committed: number; paid: number; projectedFinalCost: number; overBudget: number; contingencyRemaining: number; pendingVariations: number };
  programme: { baseline: string | null; baselineFinish: string | null; forecastFinish: string | null; finishVarianceDays: number | null; plannedPercent: number | null; actualPercent: number | null; lateContracts: number; maxDaysLate: number };
  approvals: { waiting: number; overdue: number };
  risks: { open: number; high: number };
  site: { ncrs: number; defects: number; claims: number; handover: number };
  health: { cost: Health; time: Health; approvals: Health; risk: Health; overall: Health };
}

interface Portfolio {
  generatedAt: string;
  totals: {
    projects: number;
    active: number;
    withBudget: number;
    revisedBudget: number;
    projectedFinalCost: number;
    committed: number;
    paid: number;
    overBudget: number;
    behindProgramme: number;
    approvalsWaiting: number;
    approvalsOverdue: number;
    highRisks: number;
    health: { RED: number; AMBER: number; GREEN: number };
    missingFx: string[];
  };
  projects: Row[];
}

const DOT: Record<Health, string> = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-400', RED: 'bg-red-500', NONE: 'bg-slate-300 dark:bg-slate-600' };
const WORD: Record<Health, string> = { GREEN: 'On track', AMBER: 'Watch', RED: 'Needs attention', NONE: 'Not tracked' };
const RANK: Record<Health, number> = { RED: 0, AMBER: 1, GREEN: 2, NONE: 3 };
const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const money = (n: number, currency = 'ZAR') => new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
// Two decimals under R 10m, so R 1.12m and R 1.05m don't both read R 1.1m.
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `R ${(n / 1_000_000).toFixed(Math.abs(n) < 10_000_000 ? 2 : 1)}m` : Math.abs(n) >= 1000 ? `R ${Math.round(n / 1000)}k` : `R ${Math.round(n)}`);
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Dot({ h, label }: { h: Health; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label}: ${WORD[h]}`}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[h]}`} aria-hidden />
      <span className="sr-only">
        {label}: {WORD[h]}
      </span>
    </span>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className={card}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function costLine(r: Row) {
  if (r.cost.revisedBudget <= 0) return 'No budget set';
  // Against what was set aside: the budget and its contingency.
  return `${short(r.cost.projectedFinalCost)} of ${short(r.cost.budget + r.cost.contingency)}${r.cost.overBudget > 0 ? `, ${short(r.cost.overBudget)} over` : ''}`;
}
function timeLine(r: Row) {
  const p = r.programme;
  if (p.lateContracts) return `${p.lateContracts} contract${p.lateContracts === 1 ? '' : 's'} late, up to ${p.maxDaysLate} days`;
  if (p.finishVarianceDays == null) return p.forecastFinish ? `Finish ${fmt(p.forecastFinish)}` : 'No baseline';
  return `${fmt(p.forecastFinish)} · ${p.finishVarianceDays === 0 ? 'on baseline' : `${p.finishVarianceDays > 0 ? '+' : '−'}${Math.abs(p.finishVarianceDays)} days`}`;
}

/** Every project on one screen (roadmap item 5, 2026-11-04): the call on
 * cost, programme, client approvals and risk, with the numbers behind it. */
export default function PortfolioPage() {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<'ALL' | Health>('ALL');
  const [stage, setStage] = useState('ALL');
  const [q, setQ] = useState('');

  useEffect(() => {
    authedFetch<Portfolio>('/portfolio')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load the portfolio.'));
  }, [authedFetch]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.projects ?? [])
      .filter((r) => (health === 'ALL' || r.health.overall === health) && (stage === 'ALL' || r.stage === stage) && (!needle || `${r.name} ${r.projectCode ?? ''} ${r.client ?? ''} ${r.projectManager ?? ''}`.toLowerCase().includes(needle)))
      .sort((a, b) => RANK[a.health.overall] - RANK[b.health.overall] || b.approvals.overdue - a.approvals.overdue || a.name.localeCompare(b.name));
  }, [data, health, stage, q]);
  const stages = useMemo(() => [...new Set((data?.projects ?? []).map((r) => r.stage))], [data]);

  function downloadCsv() {
    const head = ['Project', 'Code', 'Client', 'Project manager', 'Stage', 'Overall', 'Cost', 'Programme', 'Approvals', 'Risk', 'Currency', 'Revised budget', 'Projected final cost', 'Over budget', 'Forecast finish', 'Finish vs baseline (working days)', 'Approvals waiting', 'Approvals overdue', 'Open risks', 'High risks', 'Open NCRs', 'Open defects', 'Open time claims', 'Handover outstanding'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [r.name, r.projectCode, r.client, r.projectManager, projectStageInfo(r.stage).label, WORD[r.health.overall], WORD[r.health.cost], WORD[r.health.time], WORD[r.health.approvals], WORD[r.health.risk], r.currency, r.cost.revisedBudget, r.cost.projectedFinalCost, r.cost.overBudget, r.programme.forecastFinish?.slice(0, 10), r.programme.finishVarianceDays, r.approvals.waiting, r.approvals.overdue, r.risks.open, r.risks.high, r.site.ncrs, r.site.defects, r.site.claims, r.site.handover]
        .map(esc)
        .join(','),
    );
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `setjeka-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading the portfolio…</p>;
  const t = data.totals;
  const over = t.projectedFinalCost - t.revisedBudget;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            <Layers size={20} className="text-emerald-700 dark:text-emerald-400" /> Portfolio
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t.projects} projects · {t.health.RED} need attention · {t.health.AMBER} to watch · {t.health.GREEN} on track
          </p>
        </div>
        <button type="button" onClick={downloadCsv} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          <Download size={14} /> Download (CSV)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revised budget" value={short(t.revisedBudget)} note={`${t.withBudget} of ${t.projects} projects have a budget`} />
        <Stat label="Projected final cost" value={short(t.projectedFinalCost)} note={over > 0 ? `${short(over)} above budget · ${t.overBudget} over their allowance` : 'Within budget'} tone={t.overBudget ? 'text-red-700 dark:text-red-400' : undefined} />
        <Stat label="Behind programme" value={String(t.behindProgramme)} note="Forecast finish past the baseline" tone={t.behindProgramme ? 'text-amber-700 dark:text-amber-400' : undefined} />
        <Stat label="Client approvals waiting" value={String(t.approvalsWaiting)} note={`${t.approvalsOverdue} overdue · ${t.highRisks} high risks open`} tone={t.approvalsOverdue ? 'text-red-700 dark:text-red-400' : undefined} />
      </div>
      {t.missingFx.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">No exchange rate on file for {t.missingFx.join(', ')}: those amounts are left out of the rand totals.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, client or PM" aria-label="Search projects" className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm sm:w-64 dark:border-slate-700 dark:bg-slate-900" />
        <Select
          aria-label="Health"
          className="h-9 w-44 rounded-md border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          value={health}
          onChange={(v) => setHealth(v as typeof health)}
          options={[
            { value: 'ALL', label: 'Every project' },
            { value: 'RED', label: 'Needs attention' },
            { value: 'AMBER', label: 'Watch' },
            { value: 'GREEN', label: 'On track' },
          ]}
        />
        <Select aria-label="Stage" className="h-9 w-48 rounded-md border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={stage} onChange={setStage} options={[{ value: 'ALL', label: 'Every stage' }, ...stages.map((s) => ({ value: s, label: projectStageInfo(s).label }))]} />
        <span className="text-xs text-slate-500">
          {rows.length} shown · amounts in each project&apos;s currency, totals in rand
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={`${card} text-sm text-slate-400`}>No projects match.</p>
      ) : (
        <>
          {/* Phones: one card per project. */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className={card}>
                <Link href={`/projects/${r.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{r.name}</p>
                      <p className="text-xs text-slate-500">
                        {projectStageInfo(r.stage).label}
                        {r.projectManager && ` · ${r.projectManager}`}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <Dot h={r.health.overall} label="Overall" /> {WORD[r.health.overall]}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="flex items-center gap-1.5 text-slate-500">
                      <Dot h={r.health.cost} label="Cost" /> Cost
                    </dt>
                    <dd className="text-right text-slate-800 dark:text-slate-100">{costLine(r)}</dd>
                    <dt className="flex items-center gap-1.5 text-slate-500">
                      <Dot h={r.health.time} label="Programme" /> Programme
                    </dt>
                    <dd className="text-right text-slate-800 dark:text-slate-100">{timeLine(r)}</dd>
                    <dt className="flex items-center gap-1.5 text-slate-500">
                      <Dot h={r.health.approvals} label="Approvals" /> Approvals
                    </dt>
                    <dd className="text-right text-slate-800 dark:text-slate-100">
                      {r.approvals.waiting} waiting{r.approvals.overdue > 0 && `, ${r.approvals.overdue} overdue`}
                    </dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Wider screens: one row per project. */}
          <div className={`${card} hidden overflow-x-auto p-0 md:block`}>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                  <th className="px-3 py-2 font-medium">Programme</th>
                  <th className="px-3 py-2 font-medium">Client approvals</th>
                  <th className="px-3 py-2 font-medium">Risks</th>
                  <th className="px-3 py-2 font-medium">On site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id} aria-label={r.name} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${r.id}`} className="flex items-start gap-2">
                        <span className="mt-1">
                          <Dot h={r.health.overall} label="Overall" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 hover:text-emerald-700 dark:text-slate-100">{r.name}</span>
                          <span className="block text-xs text-slate-500">
                            {[r.projectCode, r.client, r.projectManager].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{projectStageInfo(r.stage).label}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Dot h={r.health.cost} label="Cost" />
                        <span className="text-slate-800 dark:text-slate-100">{costLine(r)}</span>
                      </span>
                      {r.cost.revisedBudget > 0 && (
                        <span className="block pl-4 text-slate-400">
                          contingency {money(r.cost.contingencyRemaining, r.currency)}
                          {!r.cost.budgetLocked && ' · budget not locked'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Dot h={r.health.time} label="Programme" />
                        <span className="text-slate-800 dark:text-slate-100">{timeLine(r)}</span>
                      </span>
                      {r.programme.actualPercent != null && (
                        <span className="block pl-4 text-slate-400">
                          {r.programme.actualPercent}% of {r.programme.plannedPercent}% planned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Dot h={r.health.approvals} label="Approvals" />
                        <span className="text-slate-800 dark:text-slate-100">
                          {r.approvals.waiting} waiting
                          {r.approvals.overdue > 0 && <span className="text-red-700 dark:text-red-400">, {r.approvals.overdue} overdue</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Dot h={r.health.risk} label="Risks" />
                        <span className="text-slate-800 dark:text-slate-100">
                          {r.risks.open} open{r.risks.high > 0 && `, ${r.risks.high} high`}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                      {[r.site.ncrs && `${r.site.ncrs} NCR${r.site.ncrs === 1 ? '' : 's'}`, r.site.defects && `${r.site.defects} defect${r.site.defects === 1 ? '' : 's'}`, r.site.claims && `${r.site.claims} EOT claim${r.site.claims === 1 ? '' : 's'}`, r.site.handover && `${r.site.handover} handover`].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-slate-400">
        Red: over budget by more than 5% of the budget and contingency, or contingency spent; programme more than 10 working days behind its baseline, or a contract past its revised completion; a client decision overdue; or a high risk open. Amber: any of these starting to slip. As at {new Date(data.generatedAt).toLocaleString('en-ZA')}.
      </p>
    </div>
  );
}
