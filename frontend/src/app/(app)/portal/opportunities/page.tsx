'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, MapPin } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { OPPORTUNITY_STAGE_LABEL, OPPORTUNITY_STAGE_TONE, type OpportunityStage } from '@/lib/stage0';

interface PortalOpportunity {
  id: string;
  name: string;
  developmentType: string | null;
  location: string | null;
  stage: OpportunityStage;
  convertedProject: { id: string; name: string } | null;
  sites: { name: string; address: string | null }[];
}

export default function ClientPortalOpportunitiesPage() {
  const { authedFetch } = useAuth();
  const [items, setItems] = useState<PortalOpportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<PortalOpportunity[]>('/client-portal/opportunities')
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your developments.'));
  }, [authedFetch]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My developments</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Developments Setjeka is preparing for you, from first brief until they become live projects.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {items === null && !error ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : items && items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Lightbulb size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing here yet.</p>
        </div>
      ) : (
        items && (
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {items.map((o) => (
              <li key={o.id}>
                <Link href={`/portal/opportunities/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                      {o.sites[0] ? (
                        <>
                          <MapPin size={11} />
                          {o.sites[0].address ?? o.sites[0].name}
                        </>
                      ) : (
                        [o.developmentType, o.location].filter(Boolean).join(' · ') || 'Site being sourced'
                      )}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${OPPORTUNITY_STAGE_TONE[o.stage]}`}>
                    {OPPORTUNITY_STAGE_LABEL[o.stage]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
