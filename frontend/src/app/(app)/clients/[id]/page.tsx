'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Lightbulb, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  cardClass,
  formatMoney,
  secondaryButton,
  type ClientSummary,
  type OpportunityStage,
} from '@/lib/stage0';
import { ClientForm, type ClientFormValues } from '@/components/clients/ClientForm';
import { PortalAccessPanel } from '@/components/portal/PortalAccessPanel';

interface ClientDetail extends ClientSummary {
  opportunities: { id: string; name: string; stage: OpportunityStage; estimatedValue: number | null; currency: string | null }[];
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-100">{value || '—'}</p>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { authedFetch } = useAuth();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () =>
    authedFetch<ClientDetail>(`/clients/${id}`)
      .then(setClient)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load client.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(values: ClientFormValues) {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/clients/${id}`, { method: 'PATCH', body: values });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save client.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!client || !confirm(`Delete ${client.name}? This cannot be undone.`)) return;
    try {
      await authedFetch(`/clients/${id}`, { method: 'DELETE' });
      router.push('/clients');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete client.');
    }
  }

  if (error && !client) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!client) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/clients" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft size={14} />
          Back to clients
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <Building2 size={18} />
          </div>
          <h1 className="flex-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{client.name}</h1>
          {!editing && (
            <>
              <button onClick={() => setEditing(true)} className={secondaryButton}>
                <Pencil size={14} />
                Edit
              </button>
              {client.opportunities.length === 0 && (
                <button onClick={remove} className={`${secondaryButton} text-red-600 dark:text-red-400`}>
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className={cardClass}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Client details</h2>
        {editing ? (
          <ClientForm initial={client} submitLabel="Save" saving={saving} onSubmit={save} onCancel={() => setEditing(false)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Registration number" value={client.registrationNumber} />
            <Field label="Contact person" value={client.contactName} />
            <Field label="Email" value={client.email} />
            <Field label="Phone" value={client.phone} />
            <Field label="Address" value={client.address} />
            <Field label="Notes" value={client.notes} />
          </div>
        )}
      </div>

      <PortalAccessPanel
        basePath={`/clients/${client.id}`}
        title="Client portal access"
        description="Give the client's people a login. They can follow their developments from Stage 0 — stage, sites, approvals and the appointed team — and become members of each project once it's created."
        defaultName={client.contactName}
        defaultEmail={client.email}
      />

      <div className={cardClass}>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Lightbulb size={14} />
          Opportunities
        </h2>
        {client.opportunities.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No opportunities for this client yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {client.opportunities.map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 py-2 hover:underline">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">{o.name}</span>
                  <span className="text-xs text-slate-400">{formatMoney(o.estimatedValue, o.currency)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${OPPORTUNITY_STAGE_TONE[o.stage]}`}>
                    {OPPORTUNITY_STAGE_LABEL[o.stage]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
