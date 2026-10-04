'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, CalendarCheck, Lightbulb, MapPin, Stamp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { PROJECT_STAGES } from '@/lib/projectStages';

interface ClientProject {
  id: string;
  name: string;
  projectCode: string | null;
  stage: string;
  location: string | null;
  completion: string | null;
  waitingForYou: number;
  programmePercent: number | null;
}

/** Client portal home (mobile first): the client's projects, what is waiting
 * for their decision, and their developments still at Stage 0. */
export default function ClientPortalHome() {
  const { authedFetch, user } = useAuth();
  const [projects, setProjects] = useState<ClientProject[] | null>(null);
  const [developments, setDevelopments] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<ClientProject[]>('/client-portal/projects')
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your projects.'));
    authedFetch<unknown[]>('/client-portal/opportunities')
      .then((o) => setDevelopments(o.length))
      .catch(() => setDevelopments(0));
  }, [authedFetch]);

  const waiting = projects?.reduce((s, p) => s + p.waitingForYou, 0) ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Welcome{user ? `, ${user.fullName.split(' ')[0]}` : ''}</p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Your projects</h1>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {waiting > 0 && (
        <Link href="/approvals" className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-900">
          <Stamp size={20} className="shrink-0" />
          <span className="flex-1 text-sm font-medium">
            {waiting} decision{waiting === 1 ? '' : 's'} waiting for you
          </span>
          <ArrowRight size={16} />
        </Link>
      )}

      {projects === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          <Building2 size={26} className="mx-auto mb-2 text-slate-300" />
          No projects yet. Developments move here once they reach Inception.
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => {
            const stage = PROJECT_STAGES.find((s) => s.value === p.stage);
            return (
              <li key={p.id}>
                <Link href={`/portal/projects/${p.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {stage && (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            Stage {stage.number} · {stage.label}
                          </span>
                        )}
                        {p.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={11} />
                            {p.location}
                          </span>
                        )}
                        {p.completion && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarCheck size={11} />
                            Completion {new Date(p.completion).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    {p.waitingForYou > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">{p.waitingForYou}</span>}
                  </div>
                  {p.programmePercent != null && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Programme</span>
                        <span>{p.programmePercent}% complete</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${p.programmePercent}%` }} />
                      </div>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {developments != null && developments > 0 && (
        <Link href="/portal/opportunities" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <Lightbulb size={18} className="text-emerald-600" />
          <span className="flex-1 text-slate-800 dark:text-slate-100">
            {developments} development{developments === 1 ? '' : 's'} at Stage 0
          </span>
          <ArrowRight size={16} className="text-slate-400" />
        </Link>
      )}
    </div>
  );
}
