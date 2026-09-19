'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderKanban, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject, type CurrentProject } from '@/lib/current-project-context';

export function ProjectSwitcher() {
  const { authedFetch } = useAuth();
  const { currentProject, setCurrentProject } = useCurrentProject();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<CurrentProject[] | null>(null);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!open || projects !== null) return;
    authedFetch<CurrentProject[]>('/projects')
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open, projects, authedFetch]);

  const filtered = (projects ?? []).filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition ${
          currentProject
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900'
            : 'border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
        }`}
      >
        <FolderKanban size={14} className="shrink-0" />
        <span className="max-w-[5.5rem] truncate sm:max-w-[10rem] lg:max-w-[14rem]">
          {currentProject ? currentProject.name : 'Select a project'}
        </span>
        <ChevronDown size={13} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2 dark:border-slate-700">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter projects…"
              className="h-8 flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {projects === null ? (
              <p className="px-2 py-3 text-sm text-slate-400">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-400">No projects match.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentProject(p);
                    setOpen(false);
                    setFilter('');
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                    currentProject?.id === p.id
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <FolderKanban size={14} className="shrink-0 text-slate-400" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))
            )}
          </div>

          {currentProject && (
            <>
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
              <button
                onClick={() => {
                  setCurrentProject(null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X size={14} />
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
