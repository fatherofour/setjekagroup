'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, KeyRound, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, type ClientSummary } from '@/lib/stage0';
import { ClientForm, type ClientFormValues } from '@/components/clients/ClientForm';

interface ClientRow extends ClientSummary {
  _count: { opportunities: number; portalUsers: number };
}

export default function ClientsPage() {
  const { authedFetch } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    authedFetch<ClientRow[]>('/clients')
      .then(setClients)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load clients.'));
  }, [authedFetch]);

  async function create(values: ClientFormValues) {
    setSaving(true);
    setError(null);
    try {
      const created = await authedFetch<ClientSummary>('/clients', { method: 'POST', body: values });
      router.push(`/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client.');
      setSaving(false);
    }
  }

  const visible = (clients ?? []).filter((c) =>
    [c.name, c.contactName, c.email].some((v) => v?.toLowerCase().includes(search.trim().toLowerCase())),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Clients</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Who Setjeka develops for — captured at Stage 0 and carried into every project they commission.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          <Plus size={15} />
          New client
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {showForm && (
        <div className={`${cardClass} mb-4`}>
          <ClientForm submitLabel="Create client" saving={saving} onSubmit={create} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {clients && clients.length > 0 && (
        <input
          aria-label="Search clients"
          placeholder="Search by name, contact or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 h-9 w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      )}

      {clients === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Building2 size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No clients yet. Add one here, or while creating an opportunity.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    <Building2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {[c.contactName, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details yet'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {c._count.opportunities} {c._count.opportunities === 1 ? 'opportunity' : 'opportunities'}
                  </span>
                  {c._count.portalUsers > 0 && (
                    <span className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 sm:inline-flex dark:bg-emerald-950 dark:text-emerald-300">
                      <KeyRound size={11} />
                      Portal
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No clients match “{search}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
