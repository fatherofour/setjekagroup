'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import type { MappableProject } from './ProjectsMapInner';

const ProjectsMapInner = dynamic(() => import('./ProjectsMapInner').then((m) => m.ProjectsMapInner), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>,
});

export function ProjectsMap({ projects }: { projects: MappableProject[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <MapPin size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Project sites</h2>
      </div>
      {projects.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-lg bg-slate-50 text-center dark:bg-slate-800/50">
          <MapPin size={22} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No project locations yet.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Add coordinates on the Projects page to see them here.</p>
        </div>
      ) : (
        <div className="h-64">
          <ProjectsMapInner projects={projects} />
        </div>
      )}
    </div>
  );
}
