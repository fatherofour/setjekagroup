'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { projectStageInfo, type ProjectStage } from '@/lib/projectStages';
import { CURRENCY_SYMBOL, type Currency } from '@/lib/projectMeta';

const ProjectCardMapInner = dynamic(() => import('./ProjectCardMapInner').then((m) => m.ProjectCardMapInner), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-100 dark:bg-slate-800" />,
});

export interface ProjectCardData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  stage: ProjectStage;
  currency: Currency;
  value: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string;
}

const AVATAR_TONES = [
  'bg-rose-800',
  'bg-emerald-800',
  'bg-indigo-800',
  'bg-amber-800',
  'bg-sky-800',
  'bg-fuchsia-800',
];

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const hasCoords = project.latitude != null && project.longitude != null;
  const stage = projectStageInfo(project.stage);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800"
    >
      <div className="relative h-32 shrink-0 bg-slate-100 dark:bg-slate-800">
        {hasCoords ? (
          <ProjectCardMapInner latitude={project.latitude!} longitude={project.longitude!} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <MapPin size={22} className="text-slate-300 dark:text-slate-600" />
          </div>
        )}
        {project.location && (
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs text-white backdrop-blur-sm">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{project.location}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${avatarTone(project.name)}`}>
            {project.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <h3 className="mb-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{project.name}</h3>
        {project.description && (
          <p className="mb-3 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{project.description}</p>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {project.currency}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Stage {stage.number} · {stage.label}
          </span>
        </div>

        {project.value != null && (
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Total value</p>
            <p className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {CURRENCY_SYMBOL[project.currency]}
              {project.value.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">{project.currency}</span>
            </p>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-400 dark:text-slate-500">
          <span>{timeAgo(project.updatedAt)}</span>
          <ArrowRight size={14} className="text-emerald-600 transition group-hover:translate-x-0.5 dark:text-emerald-400" />
        </div>
      </div>
    </Link>
  );
}
