'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import type { useScheduleData } from './useScheduleData';

type Flag = 'SLIPPED' | 'AHEAD' | 'ON_PLAN' | 'NEW';
type Critical = 'CRITICAL' | 'NOW_CRITICAL' | 'OFF_CRITICAL' | null;

interface Row {
  id: string;
  name: string;
  parentId: string | null;
  activityType: 'TASK' | 'MILESTONE';
  startDate: string;
  endDate: string;
  durationDays: number;
  percentComplete: number;
  status: string;
  isCriticalPath: boolean;
  contractor: { name: string } | null;
  leaf: boolean;
  isNew: boolean;
  baseline: { start: string; end: string; durationDays: number; wasCritical: boolean } | null;
  startVarianceDays: number | null;
  finishVarianceDays: number | null;
  durationVarianceDays: number | null;
  plannedPercent: number | null;
  progressGap: number | null;
  flag: Flag;
  behind: boolean;
  critical: Critical;
}

interface Variance {
  baselines: { id: string; name: string; createdAt: string }[];
  baseline: { id: string; name: string; createdAt: string; start: string | null; finish: string | null } | null;
  summary: {
    forecastFinish: string | null;
    finishVarianceDays: number;
    plannedPercent: number;
    actualPercent: number;
    slipped: number;
    slippedCritical: number;
    ahead: number;
    onPlan: number;
    behind: number;
    nowCritical: number;
    offCritical: number;
    added: number;
  } | null;
  activities: Row[];
}

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const days = (n: number | null) => (n == null ? '—' : n === 0 ? 'on plan' : `${n > 0 ? '+' : '−'}${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}`);
const tone = (n: number | null) => (n == null || n === 0 ? 'text-slate-500' : n > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400');
const card = 'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900';

/** The programme against a baseline: how far it has moved, what is behind,
 * and where the critical path went (the user's list, 2026-11-04). */
export function ScheduleVarianceView({ projectId, data }: { projectId: string; data: ReturnType<typeof useScheduleData> }) {
  const { authedFetch } = useAuth();
  const [baselineId, setBaselineId] = useState('');
  const [v, setV] = useState<Variance | null>(null);
  const [filter, setFilter] = useState<'all' | 'slipped' | 'behind' | 'critical'>('slipped');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Variance>(`/projects/${projectId}/schedule/baselines/variance${baselineId ? `?baselineId=${baselineId}` : ''}`)
      .then((x) => {
        setV(x);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load the variance.'));
  }, [authedFetch, projectId, baselineId, data.activities]);

  // One time axis for every bar: the earliest start to the latest finish.
  const range = useMemo(() => {
    const ts = (v?.activities ?? []).flatMap((r) => [r.startDate, r.endDate, r.baseline?.start, r.baseline?.end].filter(Boolean).map((d) => new Date(d as string).getTime()));
    if (!ts.length) return null;
    const lo = Math.min(...ts);
    const hi = Math.max(...ts) + 86_400_000;
    return { lo, span: Math.max(hi - lo, 86_400_000) };
  }, [v]);
  const bar = (from: string, to: string) => {
    if (!range) return {};
    const left = ((new Date(from).getTime() - range.lo) / range.span) * 100;
    const width = Math.max(((new Date(to).getTime() + 86_400_000 - new Date(from).getTime()) / range.span) * 100, 0.8);
    return { left: `${left}%`, width: `${width}%` };
  };

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!v) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!v.baseline || !v.summary)
    return <p className={`${card} text-sm text-slate-500`}>No baseline yet. Use Baselines, then &ldquo;Save current schedule as baseline&rdquo;, to fix the agreed programme; this view then shows how the programme moves against it.</p>;

  const s = v.summary;
  const rows = v.activities.filter((r) =>
    filter === 'all' ? true : filter === 'slipped' ? r.flag === 'SLIPPED' || r.isNew : filter === 'behind' ? r.behind : r.critical === 'NOW_CRITICAL' || r.critical === 'OFF_CRITICAL' || r.critical === 'CRITICAL',
  );
  const gap = s.actualPercent - s.plannedPercent;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Against <span className="font-medium">{v.baseline.name}</span>, saved {fmt(v.baseline.createdAt)}. Days are working days.
        </p>
        {v.baselines.length > 1 && (
          <Select aria-label="Baseline" className="h-9 w-56 rounded-md border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" value={baselineId || v.baseline.id} onChange={setBaselineId} options={v.baselines.map((b) => ({ value: b.id, label: `${b.name} · ${fmt(b.createdAt)}` }))} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={card}>
          <p className="text-xs text-slate-500">Forecast finish</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{fmt(s.forecastFinish)}</p>
          <p className={`text-xs font-medium ${tone(s.finishVarianceDays)}`}>
            {s.finishVarianceDays === 0 ? 'On the baseline finish' : `${days(s.finishVarianceDays)} against ${fmt(v.baseline.finish)}`}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-500">Progress today</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {s.actualPercent}% <span className="text-sm font-normal text-slate-500">of {s.plannedPercent}% planned</span>
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <div className="relative h-full">
              <div className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-600" style={{ width: `${s.plannedPercent}%` }} />
              <div className={`absolute inset-y-0 left-0 ${gap < -5 ? 'bg-red-500' : 'bg-emerald-600'}`} style={{ width: `${s.actualPercent}%` }} />
            </div>
          </div>
          <p className={`mt-1 text-xs font-medium ${gap < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{gap === 0 ? 'On plan' : `${Math.abs(gap)} points ${gap < 0 ? 'behind' : 'ahead'}`}</p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-500">Activities finishing late</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{s.slipped}</p>
          <p className="text-xs text-slate-500">
            {s.slippedCritical} on the critical path · {s.ahead} early · {s.onPlan} on plan
          </p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-500">Critical path</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{s.nowCritical + s.offCritical === 0 ? 'Unchanged' : `${s.nowCritical} newly critical`}</p>
          <p className="text-xs text-slate-500">
            {s.offCritical} no longer critical · {s.behind} behind on progress{s.added > 0 && ` · ${s.added} added since`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Activities</h3>
        <Select
          aria-label="Show activities"
          className="h-9 w-52 rounded-md border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          value={filter}
          onChange={(x) => setFilter(x as typeof filter)}
          options={[
            { value: 'slipped', label: 'Late or added' },
            { value: 'behind', label: 'Behind on progress' },
            { value: 'critical', label: 'On the critical path' },
            { value: 'all', label: 'All activities' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className={`${card} text-sm text-slate-400`}>Nothing to show here.</p>
      ) : (
        <div className={`${card} overflow-hidden p-0`}>
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="w-[38%] px-3 py-2 font-medium sm:w-[26%]">Activity</th>
                <th className="hidden w-[13%] px-3 py-2 font-medium md:table-cell">Finish</th>
                <th className="w-[22%] px-3 py-2 font-medium sm:w-[12%]">Finish moved</th>
                <th className="hidden w-[13%] px-3 py-2 font-medium sm:table-cell">Progress</th>
                <th className="w-[40%] px-3 py-2 font-medium sm:w-[36%]">
                  <span className="sr-only">Timeline</span>
                  <span aria-hidden className="flex gap-3 text-[11px] font-normal">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-3 rounded-sm bg-slate-300 dark:bg-slate-600" /> baseline
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-3 rounded-sm bg-emerald-600" /> now
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} aria-label={r.name}>
                  <td className="px-3 py-2">
                    <span className={`block truncate ${r.leaf ? 'text-slate-800 dark:text-slate-100' : 'font-semibold text-slate-900 dark:text-slate-100'}`} title={r.name}>
                      {r.name}
                    </span>
                    <span className="flex flex-wrap gap-1 text-[11px]">
                      {r.isNew && <span className="rounded bg-sky-50 px-1 text-sky-800 dark:bg-sky-950 dark:text-sky-300">added since</span>}
                      {r.critical === 'NOW_CRITICAL' && <span className="rounded bg-red-50 px-1 text-red-700 dark:bg-red-950 dark:text-red-300">now critical</span>}
                      {r.critical === 'OFF_CRITICAL' && <span className="rounded bg-slate-100 px-1 text-slate-600 dark:bg-slate-800">off the critical path</span>}
                      {r.critical === 'CRITICAL' && <span className="rounded bg-amber-50 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">critical</span>}
                      {r.behind && <span className="rounded bg-red-50 px-1 text-red-700 dark:bg-red-950 dark:text-red-300">behind</span>}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-xs md:table-cell">
                    {fmt(r.endDate)}
                    {r.baseline && <span className="block text-slate-400">was {fmt(r.baseline.end)}</span>}
                  </td>
                  <td className={`px-3 py-2 text-xs font-medium tabular-nums ${tone(r.finishVarianceDays)}`}>{r.isNew ? 'new' : days(r.finishVarianceDays)}</td>
                  <td className="hidden px-3 py-2 text-xs tabular-nums sm:table-cell">
                    {r.percentComplete}%{r.plannedPercent != null && <span className="block text-slate-400">plan {r.plannedPercent}%</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative h-5">
                      {r.baseline && <div className="absolute top-0 h-2 rounded-sm bg-slate-300 dark:bg-slate-600" style={bar(r.baseline.start, r.baseline.end)} />}
                      <div className={`absolute top-2.5 h-2 rounded-sm ${r.flag === 'SLIPPED' ? 'bg-red-500' : 'bg-emerald-600'}`} style={bar(r.startDate, r.endDate)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
