'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GanttChart, ListChecks, AlertTriangle, ShieldCheck, Star, MessageSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

interface Dashboard {
  schedule: {
    totalActivities: number;
    completedActivities: number;
    criticalPathCount: number;
    upcomingMilestones: { id: string; name: string; date: string }[];
  };
  tasks: Record<string, number>;
  issues: Record<string, number>;
  compliance: { VALID: number; EXPIRING_SOON: number; EXPIRED: number; PENDING_VERIFICATION: number };
  contractorsCount: number;
  ratings: { average: number | null; count: number };
  recentComments: { id: string; body: string; author: { fullName: string }; createdAt: string }[];
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof GanttChart; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-2 text-slate-400 dark:text-slate-500">
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${tone ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}

export function ProjectOverviewDashboard({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Dashboard>(`/projects/${projectId}/dashboard`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the project overview.'));
  }, [projectId, authedFetch]);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading overview…</p>;

  const scheduleProgress = data.schedule.totalActivities > 0 ? Math.round((data.schedule.completedActivities / data.schedule.totalActivities) * 100) : null;
  const openIssuesCount = (data.issues.OPEN ?? 0) + (data.issues.IN_PROGRESS ?? 0) + (data.issues.ESCALATED ?? 0);
  const complianceIssues = data.compliance.EXPIRED + data.compliance.EXPIRING_SOON + data.compliance.PENDING_VERIFICATION;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Link href={`/projects/${projectId}/schedule`}>
          <StatCard
            icon={GanttChart}
            label="Schedule"
            value={scheduleProgress != null ? `${scheduleProgress}%` : '—'}
            tone={data.schedule.criticalPathCount > 0 ? 'text-red-600 dark:text-red-400' : undefined}
          />
        </Link>
        <StatCard icon={ListChecks} label="Open tasks" value={String(sum(data.tasks) - (data.tasks.DONE ?? 0))} />
        <StatCard
          icon={AlertTriangle}
          label="Open issues"
          value={String(openIssuesCount)}
          tone={openIssuesCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
        />
        <StatCard
          icon={ShieldCheck}
          label="Compliance flags"
          value={String(complianceIssues)}
          tone={complianceIssues > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
        />
        <StatCard icon={Star} label="Avg. rating" value={data.ratings.average != null ? data.ratings.average.toFixed(1) : '—'} />
      </div>

      {data.schedule.criticalPathCount > 0 && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {data.schedule.criticalPathCount} activit{data.schedule.criticalPathCount === 1 ? 'y is' : 'ies are'} on the critical path —{' '}
          <Link href={`/projects/${projectId}/schedule`} className="underline">
            view schedule
          </Link>
          .
        </p>
      )}

      {data.schedule.upcomingMilestones.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Upcoming milestones</h3>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {data.schedule.upcomingMilestones.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.name}</span>
                <span className="text-slate-400">{new Date(m.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <MessageSquare size={14} />
          Recent activity
        </h3>
        {data.recentComments.length === 0 ? (
          <p className="text-sm text-slate-400">No comments yet on this project.</p>
        ) : (
          <ul className="space-y-2">
            {data.recentComments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{c.author.fullName}</span>{' '}
                <span className="text-slate-500 dark:text-slate-400">{c.body}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
