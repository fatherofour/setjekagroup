'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FolderKanban,
  ClipboardList,
  Activity,
  PauseCircle,
  CheckCircle2,
  Plus,
  Wallet,
  Calculator,
  Boxes,
  Cog,
  Camera,
  CalendarClock,
  MessageCircleQuestion,
  FileCheck,
  ClipboardCheck,
  ListChecks,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { ProjectsMap } from '@/components/dashboard/ProjectsMap';
import { WeatherWidget } from '@/components/dashboard/WeatherWidget';
import { GettingStarted } from '@/components/dashboard/GettingStarted';
import { PortfolioOverview } from '@/components/dashboard/PortfolioOverview';
import { TodaySnapshot } from '@/components/dashboard/TodaySnapshot';
import { SitesPanel } from '@/components/dashboard/SitesPanel';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { AnalyticsSection } from '@/components/dashboard/AnalyticsSection';
import { ComingSoonWidget } from '@/components/dashboard/ComingSoonWidget';

interface Project {
  id: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function KpiTile({
  icon: Icon,
  value,
  label,
  tone,
  loading,
}: {
  icon: typeof FolderKanban;
  value: number;
  label: string;
  tone: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        {loading ? (
          <div className="h-5 w-8 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// Widgets that would exist once their underlying module is built. Shown with
// an honest "coming soon" state rather than fabricated numbers, so the
// dashboard's layout matches the full design without pretending data exists.
const COMING_SOON_WIDGETS = [
  { icon: Wallet, title: 'Finance summary', description: 'Budget vs. actuals across your portfolio, once budgets are tracked.' },
  { icon: Calculator, title: 'Estimate resources', description: 'Labour, material and equipment resourcing from the estimate builder.' },
  { icon: Boxes, title: 'BIM coverage', description: 'How much of each project has a linked BIM model, once BIM Takeoff lands.' },
  { icon: Cog, title: 'Operations snapshot', description: 'Daily diary and site operations at a glance.' },
  { icon: Camera, title: 'Latest site photos', description: 'Recent photos from site, once photo capture is built.' },
  { icon: CalendarClock, title: 'Upcoming milestones', description: 'Programme milestones due soon, once Schedule is wired to projects.' },
  { icon: MessageCircleQuestion, title: 'RFI turnaround', description: 'Average time to close out RFIs, once RFIs exist.' },
  { icon: FileCheck, title: 'Submittals pending', description: 'Submittals awaiting review, once the module exists.' },
  { icon: ClipboardCheck, title: 'Inspections quality', description: 'Pass/fail rates from site inspections, once tracked.' },
  { icon: ListChecks, title: 'Punch list quality', description: 'Open vs. closed punch items, once punch lists exist.' },
  { icon: BookOpen, title: 'Cases', description: 'Learn-by-example cases from past projects.' },
] as const;

export default function DashboardPage() {
  const { user, authedFetch } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Project[]>('/projects')
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load projects.'));
  }, [authedFetch]);

  const loading = projects === null;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [projects]);

  const counts = useMemo(() => {
    const list = projects ?? [];
    const nonArchived = list.filter((p) => p.status !== 'ARCHIVED');
    return {
      total: nonArchived.length,
      planning: statusCounts.PLANNING ?? 0,
      active: statusCounts.ACTIVE ?? 0,
      onHold: statusCounts.ON_HOLD ?? 0,
      completed: statusCounts.COMPLETED ?? 0,
    };
  }, [projects, statusCounts]);

  const mappable = useMemo(
    () =>
      (projects ?? [])
        .filter((p): p is Project & { latitude: number; longitude: number } => p.latitude != null && p.longitude != null)
        .map((p) => ({ id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude })),
    [projects],
  );

  const recent = useMemo(() => (projects ?? []).slice(0, 5), [projects]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Merriweather', serif", color: '#0E3D2C' }}>
          {greeting()}, {user?.fullName.split(' ')[0]}.
        </h1>
        <Link
          href="/projects"
          className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          <Plus size={15} />
          New Project
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!loading && <GettingStarted hasProjects={(projects?.length ?? 0) > 0} hasSitedProjects={mappable.length > 0} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          icon={FolderKanban}
          value={counts.total}
          label="Total projects"
          tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          loading={loading}
        />
        <KpiTile
          icon={ClipboardList}
          value={counts.planning}
          label="Planning"
          tone="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400"
          loading={loading}
        />
        <KpiTile
          icon={Activity}
          value={counts.active}
          label="Active"
          tone="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
          loading={loading}
        />
        <KpiTile
          icon={PauseCircle}
          value={counts.onHold}
          label="On hold"
          tone="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
          loading={loading}
        />
        <KpiTile
          icon={CheckCircle2}
          value={counts.completed}
          label="Completed"
          tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioOverview activeCount={counts.active} />
        <TodaySnapshot />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectsMap projects={mappable} />
        <WeatherWidget sites={mappable} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SitesPanel sites={mappable} />
        <ActivityFeed projects={projects ?? []} />
        <AnalyticsSection statusCounts={statusCounts} total={projects?.length ?? 0} />
        {COMING_SOON_WIDGETS.map((widget) => (
          <ComingSoonWidget key={widget.title} icon={widget.icon} title={widget.title} description={widget.description} />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent projects</h2>
        </div>
        {projects === null ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet.</p>
            <Link href="/projects" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Create your first project
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
