'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isClientUser } from '@/lib/portal';
import Link from 'next/link';
import {
  FolderKanban,
  ClipboardList,
  Activity,
  PauseCircle,
  CheckCircle2,
  Plus,
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
import { OverallDealsCard } from '@/components/firm-deals/FirmDeals';
import { formatDate } from '@/lib/dates';

interface Project {
  id: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  stage: string;
  closureType: 'COMPLETED' | 'ABANDONED' | null;
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
export default function DashboardPage() {
  const { user, authedFetch } = useAuth();
  const staff = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const router = useRouter();
  // Clients work in their own portal (mobile first), not the staff dashboard.
  useEffect(() => {
    if (isClientUser(user)) router.replace('/portal');
  }, [user, router]);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Project[]>('/projects')
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load projects.'));
  }, [authedFetch]);

  const loading = projects === null;

  // Counted by stage, which moves as the project does; the status field
  // stayed at Planning (critique H-06). Finished or abandoned projects and
  // archived ones count as closed.
  const counts = useMemo(() => {
    const list = (projects ?? []).filter((p) => p.status !== 'ARCHIVED');
    const closed = (p: Project) => Boolean(p.closureType) || p.status === 'COMPLETED';
    const open = list.filter((p) => !closed(p));
    return {
      total: list.length,
      preConstruction: open.filter((p) => !['CONSTRUCTION', 'CLOSEOUT'].includes(p.stage)).length,
      construction: open.filter((p) => p.stage === 'CONSTRUCTION').length,
      closeout: open.filter((p) => p.stage === 'CLOSEOUT').length,
      completed: list.filter(closed).length,
      onHold: open.filter((p) => p.status === 'ON_HOLD').length,
      live: open.length,
    };
  }, [projects]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of projects ?? []) if (p.status !== 'ARCHIVED' && !p.closureType && p.status !== 'COMPLETED') c[p.stage] = (c[p.stage] ?? 0) + 1;
    return c;
  }, [projects]);

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
        {/* Brand green in light mode; a light green in dark mode, which was
            dark green on near-black (critique M-12). */}
        <h1 className="text-2xl font-bold text-[#0E3D2C] dark:text-emerald-200" style={{ fontFamily: "'Merriweather', serif" }}>
          {greeting()}, {user?.fullName.split(' ')[0]}.
        </h1>
        {/* Only Setjeka creates projects (critique H-04). */}
        {staff && (
          <Link
            href="/projects/new"
            className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
          >
            <Plus size={15} />
            New Project
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* A contractor's or consultant's own total with Setjeka, across projects. */}
      {!staff && <OverallDealsCard />}

      {!loading && staff && <GettingStarted hasProjects={(projects?.length ?? 0) > 0} hasSitedProjects={mappable.length > 0} />}

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
          value={counts.preConstruction}
          label="Before construction"
          tone="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-400"
          loading={loading}
        />
        <KpiTile
          icon={Activity}
          value={counts.construction}
          label="In construction"
          tone="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
          loading={loading}
        />
        <KpiTile
          icon={PauseCircle}
          value={counts.closeout}
          label="In close-out"
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
        <PortfolioOverview activeCount={counts.live} />
        {staff && <TodaySnapshot />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectsMap projects={mappable} />
        <WeatherWidget sites={mappable} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SitesPanel sites={mappable} />
        <ActivityFeed projects={projects ?? []} />
        <AnalyticsSection stageCounts={stageCounts} total={counts.live} />
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
            {staff ? (
              <Link href="/projects/new" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Create your first project
              </Link>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Setjeka adds you to a project when your firm is appointed to it.</p>
            )}
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
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(p.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
