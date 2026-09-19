'use client';

import { Activity as ActivityIcon } from 'lucide-react';

export interface ActivityProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface Event {
  id: string;
  text: string;
  at: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ projects }: { projects: ActivityProject[] }) {
  const events: Event[] = projects
    .flatMap((p) => {
      const items: Event[] = [{ id: `${p.id}-created`, text: `"${p.name}" was created`, at: p.createdAt }];
      if (p.updatedAt !== p.createdAt) {
        items.push({ id: `${p.id}-updated`, text: `"${p.name}" was updated`, at: p.updatedAt });
      }
      return items;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <ActivityIcon size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Activity</h2>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nothing has happened yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="text-slate-700 dark:text-slate-200">{event.text}</span>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{timeAgo(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
