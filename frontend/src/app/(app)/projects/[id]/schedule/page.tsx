'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Save, ChevronDown, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject } from '@/lib/current-project-context';
import type { ProjectStage } from '@/lib/projectStages';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { useScheduleData } from '@/components/schedule/useScheduleData';
import { ActivityDetailPanel, type ActivityPanelMode } from '@/components/schedule/ActivityDetailPanel';
import { ScheduleGridView } from '@/components/schedule/ScheduleGridView';
import { ScheduleGanttView } from '@/components/schedule/ScheduleGanttView';
import { ScheduleCalendarView } from '@/components/schedule/ScheduleCalendarView';
import { ScheduleCardView } from '@/components/schedule/ScheduleCardView';
import { ScheduleImportButton } from '@/components/schedule/ScheduleImportButton';

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  stage: ProjectStage;
}

interface Baseline {
  id: string;
  name: string;
  createdAt: string;
}

const VIEW_TABS: TabItem[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'gantt', label: 'Gantt' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'card', label: 'Card' },
];

function BaselinesMenu({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [baselines, setBaselines] = useState<Baseline[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setBaselines(await authedFetch<Baseline[]>(`/projects/${projectId}/schedule/baselines`));
    } catch {
      setBaselines([]);
    }
  }

  async function saveBaseline() {
    const name = window.prompt('Name this baseline (e.g. "Tender programme", "Baseline 1")');
    if (!name?.trim()) return;
    setSaving(true);
    try {
      await authedFetch(`/projects/${projectId}/schedule/baselines`, { method: 'POST', body: { name: name.trim() } });
      await load();
    } catch {
      // surfaced inline is unnecessary for a secondary action — the menu simply won't show the new baseline
    } finally {
      setSaving(false);
    }
  }

  async function removeBaseline(id: string) {
    if (!confirm('Delete this baseline?')) return;
    await authedFetch(`/projects/${projectId}/schedule/baselines/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!baselines) load();
        }}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Save size={14} />
        Baselines
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            onClick={saveBaseline}
            disabled={saving}
            className="mb-2 flex w-full items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Plus size={13} />
            Save current schedule as baseline
          </button>
          {baselines === null ? (
            <p className="px-2 py-1 text-xs text-slate-400">Loading…</p>
          ) : baselines.length === 0 ? (
            <p className="px-2 py-1 text-xs text-slate-400">No baselines saved yet.</p>
          ) : (
            <ul className="space-y-1">
              {baselines.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {b.name} <span className="text-slate-400">· {new Date(b.createdAt).toLocaleDateString()}</span>
                  </span>
                  <button onClick={() => removeBaseline(b.id)} className="shrink-0 text-slate-400 hover:text-red-600" aria-label={`Delete ${b.name}`}>
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { authedFetch } = useAuth();
  const { setCurrentProject } = useCurrentProject();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [view, setView] = useState('grid');
  const [panelMode, setPanelMode] = useState<ActivityPanelMode | null>(null);
  const scheduleData = useScheduleData(id);

  useEffect(() => {
    authedFetch<ProjectSummary>(`/projects/${id}`)
      .then((p) => {
        setProject(p);
        setCurrentProject({ id: p.id, name: p.name, status: p.status, stage: p.stage });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/projects/${id}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} />
          Back to project
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Schedule</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project?.name ?? 'Loading…'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScheduleImportButton projectId={id} onImported={scheduleData.reload} />
            <BaselinesMenu projectId={id} />
            <button
              onClick={() => setPanelMode({ kind: 'create', parentId: null })}
              className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800"
            >
              <Plus size={14} />
              Add activity
            </button>
          </div>
        </div>
      </div>

      {scheduleData.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {scheduleData.error}
        </p>
      )}

      <Tabs tabs={VIEW_TABS} value={view} onChange={setView} />

      {view === 'grid' && (
        <ScheduleGridView
          data={scheduleData}
          onSelect={(activityId) => setPanelMode({ kind: 'edit', activityId })}
          onAddChild={(parentId) => setPanelMode({ kind: 'create', parentId })}
        />
      )}
      {view === 'gantt' && <ScheduleGanttView data={scheduleData} onSelect={(activityId) => setPanelMode({ kind: 'edit', activityId })} />}
      {view === 'calendar' && <ScheduleCalendarView data={scheduleData} onSelect={(activityId) => setPanelMode({ kind: 'edit', activityId })} />}
      {view === 'card' && <ScheduleCardView data={scheduleData} onSelect={(activityId) => setPanelMode({ kind: 'edit', activityId })} />}

      {panelMode && (
        <ActivityDetailPanel
          key={panelMode.kind === 'edit' ? panelMode.activityId : `create-${panelMode.parentId}`}
          mode={panelMode}
          data={scheduleData}
          onClose={() => setPanelMode(null)}
        />
      )}
    </div>
  );
}
