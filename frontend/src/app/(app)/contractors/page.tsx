'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HardHat, Plus, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { Contractor } from '@/lib/contractors';
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, REGISTRATION_STATUSES, REGISTRATION_STATUS_LABEL, REGISTRATION_STATUS_TONE } from '@/lib/organisationMeta';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { Select } from '@/components/ui/Select';

export default function ContractorsPage() {
  const { authedFetch } = useAuth();
  const [contractors, setContractors] = useState<Contractor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('registrationStatus', statusFilter);
      if (classificationFilter.length === 1) params.set('classification', classificationFilter[0]);
      const data = await authedFetch<Contractor[]>(`/contractors?${params.toString()}`);
      setContractors(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load contractors.');
    }
  };

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, classificationFilter]);

  const visible = useMemo(() => {
    if (!contractors) return contractors;
    if (classificationFilter.length <= 1) return contractors;
    // Server only filters by a single classification; AND the rest client-side.
    return contractors.filter((c) => classificationFilter.every((cl) => c.classifications.includes(cl as never)));
  }, [contractors, classificationFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Contractors & Vendors</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The shared directory of organisations Setjeka brings onto projects — contractors, consultants, suppliers and more.
          </p>
        </div>
        <Link
          href="/contractors/new"
          className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          <Plus size={15} />
          Add contractor
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: '', label: 'All statuses' }, ...REGISTRATION_STATUSES.map((s) => ({ value: s, label: REGISTRATION_STATUS_LABEL[s] }))]}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>
      <div className="mb-4">
        <ToggleChips
          options={CLASSIFICATIONS.map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))}
          selected={classificationFilter}
          onChange={setClassificationFilter}
        />
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {visible === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <HardHat size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No contractors match.</p>
          <Link href="/contractors/new" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Add your first contractor
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((c) => (
              <li key={c.id}>
                <Link href={`/contractors/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    <HardHat size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {[
                        c.classifications.map((cl) => CLASSIFICATION_LABEL[cl]).join(', '),
                        c.disciplines.slice(0, 2).join(', '),
                        [c.city, c.country].filter(Boolean).join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No details yet'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${REGISTRATION_STATUS_TONE[c.registrationStatus]}`}>
                    {REGISTRATION_STATUS_LABEL[c.registrationStatus]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
