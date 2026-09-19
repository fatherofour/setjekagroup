'use client';

import { MapPinned } from 'lucide-react';

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export function SitesPanel({ sites }: { sites: Site[] }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <MapPinned size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sites</h2>
      </div>
      {sites.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No project has coordinates set yet.</p>
      ) : (
        <ul className="space-y-2">
          {sites.map((site) => (
            <li key={site.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-slate-700 dark:text-slate-200">{site.name}</span>
              <span className="shrink-0 tabular-nums text-xs text-slate-400 dark:text-slate-500">
                {site.latitude.toFixed(3)}, {site.longitude.toFixed(3)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
