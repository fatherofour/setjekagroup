'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { inputClass, type ClientSummary } from '@/lib/stage0';
import { ClientForm, type ClientFormValues } from './ClientForm';

const NEW = '__new__';

interface Props {
  value: string;
  onChange: (clientId: string) => void;
  id?: string;
}

/** Pick a registered client, or register a new one in place without leaving
 * the form you're in (PROCSA 0.1-0.3 happen while the opportunity is fresh). */
export function ClientPicker({ value, onChange, id }: Props) {
  const { authedFetch } = useAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<ClientSummary[]>('/clients').then(setClients).catch(() => setClients([]));
  }, [authedFetch]);

  async function create(values: ClientFormValues) {
    setSaving(true);
    setError(null);
    try {
      const created = await authedFetch<ClientSummary>('/clients', { method: 'POST', body: values });
      setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      setCreating(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Select
        id={id}
        aria-label="Client"
        value={creating ? NEW : value}
        onChange={(v) => {
          if (v === NEW) setCreating(true);
          else {
            setCreating(false);
            onChange(v);
          }
        }}
        className={inputClass}
        options={[
          { value: '', label: 'No client yet' },
          ...clients.map((c) => ({ value: c.id, label: c.name })),
          { value: NEW, label: '+ New client…' },
        ]}
      />
      {creating && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="mb-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">New client</p>
          {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
          <ClientForm compact embedded submitLabel="Add client" saving={saving} onSubmit={create} onCancel={() => setCreating(false)} />
        </div>
      )}
    </div>
  );
}
