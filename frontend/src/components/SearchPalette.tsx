'use client';

import { useEffect, useState } from 'react';
import { FolderKanban, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject, type CurrentProject } from '@/lib/current-project-context';

export function SearchPalette() {
  const { authedFetch } = useAuth();
  const { setCurrentProject } = useCurrentProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<CurrentProject[] | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    authedFetch<CurrentProject[]>('/projects')
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open, authedFetch]);

  const results = (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  function select(project: CurrentProject) {
    setCurrentProject(project);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-8 w-44 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-400 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 sm:flex md:w-56"
        type="button"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search projects…</span>
        <kbd className="rounded border border-slate-200 px-1 text-[10px] dark:border-slate-700">⌘K</kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 sm:hidden"
        aria-label="Search"
        type="button"
      >
        <Search size={16} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <Search size={16} className="text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects by name…"
                className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
              />
              <button onClick={() => setOpen(false)} aria-label="Close search" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {projects === null ? (
                <p className="px-2 py-4 text-sm text-slate-400">Loading…</p>
              ) : results.length === 0 ? (
                <p className="px-2 py-4 text-sm text-slate-400">
                  {query ? `No projects match "${query}".` : 'No projects yet.'}
                </p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => select(p)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FolderKanban size={14} className="shrink-0 text-slate-400" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
