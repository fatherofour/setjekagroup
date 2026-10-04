'use client';

import { useState, type FormEvent } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { CURRENCY_OPTIONS, type Currency } from '@/lib/projectMeta';
import type { CostRegion } from '@/lib/commercial';

const empty = { name: '', country: '', currency: 'ZAR' as Currency, notes: '' };

/** Titled pricing regions, e.g. "Nigeria — Lagos". Every price in the cost
 * database belongs to one region, in that region's currency. */
export function RegionsPanel({ regions, onChange }: { regions: CostRegion[]; onChange: () => void }) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(regions.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name: form.name.trim(), country: form.country.trim() || undefined, currency: form.currency, notes: form.notes.trim() || undefined };
      if (editing) await authedFetch(`/cost-regions/${editing}`, { method: 'PATCH', body });
      else await authedFetch('/cost-regions', { method: 'POST', body });
      setForm(empty);
      setEditing(null);
      setAdding(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the region.');
    } finally {
      setBusy(false);
    }
  }

  async function act(r: CostRegion, action: 'toggle' | 'delete') {
    setError(null);
    try {
      if (action === 'delete') {
        if (!confirm(`Delete the region "${r.name}" and all ${r._count?.prices ?? 0} of its prices?`)) return;
        await authedFetch(`/cost-regions/${r.id}`, { method: 'DELETE' });
      } else {
        await authedFetch(`/cost-regions/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } });
      }
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  const showForm = adding || editing;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pricing regions</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              Give each place you price work in its own region and currency, e.g. <em>Nigeria — Lagos</em> in NGN or <em>South Africa — Gauteng</em> in ZAR. Prices you enter are kept against the region, so next time you work there they&apos;re ready to use.
            </p>
          </div>
          {!showForm && (
            <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
              <Plus size={14} />
              Add region
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="region-name">
                Region title
              </label>
              <input id="region-name" className={inputClass} placeholder="e.g. Nigeria — Lagos" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="region-country">
                Country
              </label>
              <input id="region-country" className={inputClass} placeholder="e.g. Nigeria" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="region-currency">
                Currency
              </label>
              <Select id="region-currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v as Currency })} options={CURRENCY_OPTIONS} className={inputClass} />
            </div>
            <div className="sm:col-span-4">
              <label className={labelClass} htmlFor="region-notes">
                Notes
              </label>
              <input id="region-notes" className={inputClass} placeholder="e.g. Prices from Lagos Island suppliers, ex-VAT" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={busy || !form.name.trim()} className={primaryButton}>
                {busy ? 'Saving…' : editing ? 'Save region' : 'Add region'}
              </button>
              {regions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditing(null);
                    setForm(empty);
                  }}
                  className={secondaryButton}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {regions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No regions yet. Add the first place you price work in.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {regions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <MapPin size={15} className={r.isActive ? 'text-emerald-600' : 'text-slate-300'} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${r.isActive ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{r.name}</p>
                  <p className="text-xs text-slate-500">
                    {[r.country, r.currency, `${r._count?.prices ?? 0} prices`, r.lastPriceUpdate && `last updated ${new Date(r.lastPriceUpdate).toLocaleDateString()}`, r.notes].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => {
                    setEditing(r.id);
                    setAdding(false);
                    setForm({ name: r.name, country: r.country ?? '', currency: r.currency, notes: r.notes ?? '' });
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => act(r, 'toggle')} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  {r.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
                <button type="button" aria-label={`Delete ${r.name}`} onClick={() => act(r, 'delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
