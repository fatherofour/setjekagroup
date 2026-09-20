'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

interface AuditLogEntry {
  id: string;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  projectId: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
}

interface AuditLogResponse {
  total: number;
  page: number;
  pageSize: number;
  entries: AuditLogEntry[];
}

export function AuditLogPanel() {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<AuditLogResponse>(`/audit-log?page=${page}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the audit log.'));
  }, [page, authedFetch]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Audit log</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {data === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No activity recorded yet.</p>
      ) : (
        <>
          <ul className="mb-3 divide-y divide-slate-100 dark:divide-slate-800">
            {data.entries.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <p className="text-slate-800 dark:text-slate-100">
                  <span className="font-medium">{e.user.fullName}</span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    {e.action.toLowerCase()}d on {e.module.toLowerCase().replace('_', ' ')}
                  </span>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(e.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>
              Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))} ({data.total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                Previous
              </button>
              <button
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
