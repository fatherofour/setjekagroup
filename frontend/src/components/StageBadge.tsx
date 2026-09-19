'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject } from '@/lib/current-project-context';
import { PROJECT_STAGES, projectStageInfo, type ProjectStage } from '@/lib/projectStages';

export function StageBadge() {
  const { authedFetch } = useAuth();
  const { currentProject, setCurrentProject } = useCurrentProject();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!currentProject) return null;
  const current = projectStageInfo(currentProject.stage);

  async function selectStage(stage: ProjectStage) {
    if (!currentProject || stage === currentProject.stage) {
      setOpen(false);
      return;
    }
    const previous = currentProject;
    setCurrentProject({ ...currentProject, stage });
    setSaving(true);
    setOpen(false);
    try {
      await authedFetch(`/projects/${currentProject.id}`, { method: 'PATCH', body: { stage } });
    } catch {
      setCurrentProject(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <span className="font-medium">Stage {current.number}</span>
        <span className="hidden text-slate-400 lg:inline dark:text-slate-500">{current.label}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {PROJECT_STAGES.map((stage) => (
            <button
              key={stage.value}
              onClick={() => selectStage(stage.value)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                stage.value === currentProject.stage
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {stage.value === currentProject.stage && <Check size={14} />}
              </span>
              <span className="font-medium">Stage {stage.number}</span>
              <span className="truncate text-slate-400 dark:text-slate-500">{stage.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
