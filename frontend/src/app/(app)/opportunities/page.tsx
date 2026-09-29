'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Lightbulb, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';

type OpportunityStage = 'IDENTIFIED' | 'UNDER_EVALUATION' | 'APPROVED' | 'ON_HOLD' | 'REJECTED' | 'CONVERTED';

interface Opportunity {
  id: string;
  name: string;
  developmentType: string | null;
  location: string | null;
  clientName: string | null;
  estimatedValue: number | null;
  currency: string | null;
  stage: OpportunityStage;
  convertedProject: { id: string; name: string; projectCode: string | null } | null;
}

const STAGE_LABEL: Record<OpportunityStage, string> = {
  IDENTIFIED: 'Identified',
  UNDER_EVALUATION: 'Under Evaluation',
  APPROVED: 'Approved',
  ON_HOLD: 'On Hold',
  REJECTED: 'Rejected',
  CONVERTED: 'Converted',
};
const STAGE_TONE: Record<OpportunityStage, string> = {
  IDENTIFIED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  UNDER_EVALUATION: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  ON_HOLD: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  CONVERTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

const inputClass =
  'h-9 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export default function OpportunitiesPage() {
  const { authedFetch } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', clientName: '', developmentType: '', location: '', estimatedValue: '', currency: 'ZAR' });

  const load = async () => {
    try {
      setOpportunities(await authedFetch<Opportunity[]>('/opportunities'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load opportunities.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch('/opportunities', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          clientName: form.clientName.trim() || undefined,
          developmentType: form.developmentType.trim() || undefined,
          location: form.location.trim() || undefined,
          estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
          currency: form.currency,
        },
      });
      setForm({ name: '', clientName: '', developmentType: '', location: '', estimatedValue: '', currency: 'ZAR' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create opportunity.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Opportunities</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Prospective developments — Stage 0, before an opportunity becomes a real project.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          <Plus size={15} />
          New opportunity
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input placeholder="Opportunity name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Client name" className={inputClass} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            <input placeholder="Development type (optional)" className={inputClass} value={form.developmentType} onChange={(e) => setForm({ ...form, developmentType: e.target.value })} />
            <input placeholder="Location (optional)" className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <div className="flex gap-2">
              <input type="number" placeholder="Estimated value" className={`${inputClass} flex-1`} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
              <Select value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={[{ value: 'ZAR', label: 'ZAR' }, { value: 'USD', label: 'USD' }]} className={inputClass} />
            </div>
          </div>
          <button type="submit" disabled={saving || !form.name.trim()} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {opportunities === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : opportunities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Lightbulb size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No opportunities yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {opportunities.map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                    <Lightbulb size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {[o.clientName, o.developmentType, o.location].filter(Boolean).join(' · ') || 'No details yet'}
                    </p>
                  </div>
                  {o.estimatedValue != null && (
                    <span className="shrink-0 text-xs text-slate-400">
                      {o.currency} {o.estimatedValue.toLocaleString()}
                    </span>
                  )}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_TONE[o.stage]}`}>{STAGE_LABEL[o.stage]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
