'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatBytes } from '@/lib/files';
import { formatDateTime } from '@/lib/dates';

interface BinItem {
  id: string;
  name: string;
  drawingNumber: string | null;
  documentType: string | null;
  deletedAt: string;
  deletedBy: { fullName: string } | null;
  project: { id: string; name: string; projectCode: string | null };
  revisionCount: number;
  size: number;
}

/** Deleted documents and drawings across every project. Only an
 * administrator sees this: restoring puts a document back where it was;
 * deleting it for good removes the files too. */
export function RecycleBinPanel() {
  const { authedFetch } = useAuth();
  const [items, setItems] = useState<BinItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<BinItem[]>('/recycle-bin')
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not open the recycle bin.'));
  }, [authedFetch]);

  async function act(item: BinItem, how: 'restore' | 'purge') {
    if (how === 'purge' && !confirm(`Delete "${item.name}" for good? Its ${item.revisionCount} file${item.revisionCount === 1 ? '' : 's'} will be removed and this cannot be undone.`)) return;
    setBusy(item.id);
    setError(null);
    try {
      setItems(how === 'restore' ? await authedFetch<BinItem[]>(`/recycle-bin/${item.id}/restore`, { method: 'POST' }) : await authedFetch<BinItem[]>(`/recycle-bin/${item.id}`, { method: 'DELETE' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recycle bin</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Documents and drawings deleted on any project. Restore puts them back with all their revisions, tags and links.</p>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {items === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">The recycle bin is empty.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Document</th>
                <th className="py-1.5 pr-3 font-medium">Project</th>
                <th className="py-1.5 pr-3 font-medium">Deleted</th>
                <th className="py-1.5 pr-3 font-medium">Files</th>
                <th className="py-1.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{d.drawingNumber ? `${d.drawingNumber} · ${d.name}` : d.name}</p>
                    {d.documentType && <p className="text-xs text-slate-400">{d.documentType}</p>}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    <Link href={`/projects/${d.project.id}?tab=documents`} className="hover:underline">
                      {d.project.projectCode ? `${d.project.projectCode} · ` : ''}
                      {d.project.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(d.deletedAt)}
                    {d.deletedBy && <span className="block">by {d.deletedBy.fullName}</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500 dark:text-slate-400">
                    {d.revisionCount} · {formatBytes(d.size)}
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => act(d, 'restore')} disabled={busy === d.id} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        <RotateCcw size={12} />
                        Restore
                      </button>
                      <button onClick={() => act(d, 'purge')} disabled={busy === d.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950">
                        <Trash2 size={12} />
                        Delete for good
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
