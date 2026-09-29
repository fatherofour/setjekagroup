'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Pencil, X, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { OpportunityApprovalsPanel } from '@/components/opportunities/OpportunityApprovalsPanel';
import { Select } from '@/components/ui/Select';

type OpportunityStage = 'IDENTIFIED' | 'UNDER_EVALUATION' | 'APPROVED' | 'ON_HOLD' | 'REJECTED' | 'CONVERTED';

interface Opportunity {
  id: string;
  name: string;
  description: string | null;
  developmentType: string | null;
  location: string | null;
  estimatedValue: number | null;
  currency: string | null;
  clientName: string | null;
  clientContactName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  stage: OpportunityStage;
  convertedProject: { id: string; name: string; projectCode: string | null } | null;
}

interface StageHistoryEntry {
  id: string;
  previousStage: string;
  newStage: string;
  comment: string | null;
  changedAt: string;
  changedBy: { fullName: string };
}

const STAGE_LABEL: Record<OpportunityStage, string> = {
  IDENTIFIED: 'Identified',
  UNDER_EVALUATION: 'Under Evaluation',
  APPROVED: 'Approved',
  ON_HOLD: 'On Hold',
  REJECTED: 'Rejected',
  CONVERTED: 'Converted',
};

const STAGE_OPTIONS: OpportunityStage[] = ['IDENTIFIED', 'UNDER_EVALUATION', 'APPROVED', 'ON_HOLD', 'REJECTED'];

const inputClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-100">{value || '—'}</p>
    </div>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { authedFetch } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [history, setHistory] = useState<StageHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Opportunity>>({});
  const [stageComment, setStageComment] = useState('');

  const load = () => {
    authedFetch<Opportunity>(`/opportunities/${id}`)
      .then(setOpportunity)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load opportunity.'));
    authedFetch<StageHistoryEntry[]>(`/opportunities/${id}/history`).then(setHistory).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!opportunity) return;
    setForm({ ...opportunity });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await authedFetch<Opportunity>(`/opportunities/${id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          description: form.description || null,
          developmentType: form.developmentType || null,
          location: form.location || null,
          estimatedValue: form.estimatedValue,
          clientName: form.clientName || null,
          clientContactName: form.clientContactName || null,
          clientEmail: form.clientEmail || null,
          clientPhone: form.clientPhone || null,
        },
      });
      setOpportunity(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(stage: OpportunityStage) {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/opportunities/${id}/stage`, { method: 'PATCH', body: { stage, comment: stageComment.trim() || undefined } });
      setStageComment('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change stage.');
    } finally {
      setSaving(false);
    }
  }

  async function convertToProject() {
    if (!confirm('Convert this opportunity to a real project? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await authedFetch<Opportunity>(`/opportunities/${id}/convert-to-project`, { method: 'POST' });
      setOpportunity(updated);
      if (updated.convertedProject) router.push(`/projects/${updated.convertedProject.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to convert to project.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !opportunity) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  }
  if (!opportunity) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/opportunities" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft size={14} />
          Back to opportunities
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{opportunity.name}</h1>
          {!editing && opportunity.stage !== 'CONVERTED' && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Pencil size={14} />
              Edit details
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {opportunity.convertedProject && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Converted to project{' '}
          <Link href={`/projects/${opportunity.convertedProject.id}`} className="font-medium underline">
            {opportunity.convertedProject.name} ({opportunity.convertedProject.projectCode})
          </Link>
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Details</h2>
          {editing && (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <X size={13} />
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                <Check size={13} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 dark:text-slate-500">Description</label>
              <textarea className={`${inputClass} h-20 resize-none py-2`} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Development type</label>
              <input className={inputClass} value={form.developmentType ?? ''} onChange={(e) => setForm({ ...form, developmentType: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Location</label>
              <input className={inputClass} value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Estimated value</label>
              <input type="number" className={inputClass} value={form.estimatedValue ?? ''} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Client name</label>
              <input className={inputClass} value={form.clientName ?? ''} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Client contact name</label>
              <input className={inputClass} value={form.clientContactName ?? ''} onChange={(e) => setForm({ ...form, clientContactName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Client email</label>
              <input type="email" className={inputClass} value={form.clientEmail ?? ''} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Client phone</label>
              <input className={inputClass} value={form.clientPhone ?? ''} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {opportunity.description && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400 dark:text-slate-500">Description</p>
                <p className="text-sm text-slate-800 dark:text-slate-100">{opportunity.description}</p>
              </div>
            )}
            <Field label="Development type" value={opportunity.developmentType ?? ''} />
            <Field label="Location" value={opportunity.location ?? ''} />
            <Field label="Estimated value" value={opportunity.estimatedValue != null ? `${opportunity.currency ?? ''} ${opportunity.estimatedValue.toLocaleString()}` : ''} />
            <Field label="Client" value={opportunity.clientName ?? ''} />
            <Field label="Client contact" value={opportunity.clientContactName ?? ''} />
            <Field label="Client email" value={opportunity.clientEmail ?? ''} />
            <Field label="Client phone" value={opportunity.clientPhone ?? ''} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Stage</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {STAGE_LABEL[opportunity.stage]}
          </span>
          {opportunity.stage === 'APPROVED' && (
            <button
              onClick={convertToProject}
              disabled={saving}
              className="ml-2 flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <ArrowRight size={13} />
              Convert to Project
            </button>
          )}
        </div>

        {opportunity.stage !== 'CONVERTED' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} flex-1`}
              placeholder="Comment for this stage change (optional)"
              value={stageComment}
              onChange={(e) => setStageComment(e.target.value)}
            />
            <Select
              value=""
              onChange={(v) => changeStage(v as OpportunityStage)}
              className={`${inputClass} w-56`}
              options={[
                { value: '', label: 'Move to stage…' },
                ...STAGE_OPTIONS.filter((s) => s !== opportunity.stage).map((s) => ({ value: s, label: STAGE_LABEL[s] })),
              ]}
            />
          </div>
        )}

        {history && history.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            {history.map((h) => (
              <li key={h.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {STAGE_LABEL[h.previousStage as OpportunityStage] ?? h.previousStage} → {STAGE_LABEL[h.newStage as OpportunityStage] ?? h.newStage}
                </span>
                <span className="ml-2 text-slate-400">
                  by {h.changedBy.fullName} · {new Date(h.changedAt).toLocaleString()}
                </span>
                {h.comment && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{h.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <OpportunityApprovalsPanel opportunityId={opportunity.id} />
    </div>
  );
}
