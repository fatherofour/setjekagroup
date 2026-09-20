'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from './CommentThread';

type RiskStatus = 'OPEN' | 'MITIGATING' | 'ESCALATED' | 'CLOSED';

interface MemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

interface Risk {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  probability: number;
  impact: number;
  mitigation: string | null;
  status: RiskStatus;
  reviewDate: string | null;
  owner: MemberLite | null;
}

const STATUS_LABEL: Record<RiskStatus, string> = { OPEN: 'Open', MITIGATING: 'Mitigating', ESCALATED: 'Escalated', CLOSED: 'Closed' };
const STATUS_DOT: Record<RiskStatus, string> = { OPEN: 'bg-red-500', MITIGATING: 'bg-blue-500', ESCALATED: 'bg-amber-500', CLOSED: 'bg-slate-400' };

// Same threshold as the backend's HIGH_SEVERITY_THRESHOLD (project-risks.service.ts) —
// kept in sync by convention, not by import, since this is a plain display band.
function scoreBadge(score: number): string {
  if (score >= 15) return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
  if (score >= 8) return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
}

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const PROB_IMPACT_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

function memberLabel(m: MemberLite | null): string {
  if (!m) return 'Unassigned';
  return m.user?.fullName ?? m.externalName ?? 'Unassigned';
}

function RiskDetailPanel({
  projectId,
  risk,
  members,
  onClose,
  onChanged,
}: {
  projectId: string;
  risk: Risk;
  members: MemberLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState({
    title: risk.title,
    description: risk.description ?? '',
    category: risk.category ?? '',
    probability: risk.probability,
    impact: risk.impact,
    mitigation: risk.mitigation ?? '',
    status: risk.status,
    reviewDate: risk.reviewDate ? risk.reviewDate.slice(0, 10) : '',
    ownerId: risk.owner?.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/risks/${risk.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          description: form.description || null,
          category: form.category || null,
          probability: form.probability,
          impact: form.impact,
          mitigation: form.mitigation || null,
          status: form.status,
          reviewDate: form.reviewDate || null,
          ownerId: form.ownerId || null,
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save risk.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete risk "${risk.title}"?`)) return;
    await authedFetch(`/projects/${projectId}/risks/${risk.id}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit risk</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="space-y-3">
          <input className={`${inputClass} h-9 w-full`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea
            className="h-16 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input className={`${inputClass} w-full`} placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Probability (1-5)</label>
              <Select
                className={inputClass}
                value={String(form.probability)}
                onChange={(v) => setForm({ ...form, probability: Number(v) })}
                options={PROB_IMPACT_OPTIONS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Impact (1-5)</label>
              <Select
                className={inputClass}
                value={String(form.impact)}
                onChange={(v) => setForm({ ...form, impact: Number(v) })}
                options={PROB_IMPACT_OPTIONS}
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Score: <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${scoreBadge(form.probability * form.impact)}`}>{form.probability * form.impact}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Select
              className={inputClass}
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as RiskStatus })}
              options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <input type="date" className={inputClass} value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} title="Next review date" />
          </div>
          <Select
            className={`${inputClass} w-full`}
            value={form.ownerId}
            onChange={(v) => setForm({ ...form, ownerId: v })}
            options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
          />
          <textarea
            className="h-14 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="Mitigation plan"
            value={form.mitigation}
            onChange={(e) => setForm({ ...form, mitigation: e.target.value })}
          />
          <button onClick={save} disabled={saving} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CommentThread projectId={projectId} entityType="RISK" entityId={risk.id} />
        </div>

        <button onClick={remove} className="mt-4 flex items-center gap-1 self-start text-xs font-medium text-red-600 hover:text-red-700">
          <Trash2 size={13} />
          Delete risk
        </button>
      </div>
    </div>
  );
}

export function ProjectRisksPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [probability, setProbability] = useState('3');
  const [impact, setImpact] = useState('3');
  const [ownerId, setOwnerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [openRiskId, setOpenRiskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RiskStatus | null>(null);

  const load = () => {
    authedFetch<Risk[]>(`/projects/${projectId}/risks`)
      .then(setRisks)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load risks.'));
  };

  useEffect(() => {
    load();
    authedFetch<MemberLite[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/risks`, {
        method: 'POST',
        body: { title: title.trim(), probability: Number(probability), impact: Number(impact), ownerId: ownerId || undefined },
      });
      setTitle('');
      setProbability('3');
      setImpact('3');
      setOwnerId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add risk.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => (risks ?? []).filter((r) => !statusFilter || r.status === statusFilter), [risks, statusFilter]);
  const openRisk = risks?.find((r) => r.id === openRiskId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Risks</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter(null)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${!statusFilter ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
        >
          All
        </button>
        {(Object.keys(STATUS_LABEL) as RiskStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusFilter === s ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {risks === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No risks logged yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((r) => (
            <li key={r.id}>
              <button onClick={() => setOpenRiskId(r.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.title}</span>
                {r.category && <span className="shrink-0 text-xs text-slate-400">{r.category}</span>}
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${scoreBadge(r.probability * r.impact)}`}>
                  Score {r.probability * r.impact}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{memberLabel(r.owner)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New risk title" className={`${inputClass} flex-1`} />
        <Select value={probability} onChange={setProbability} className={`${inputClass} w-20`} options={PROB_IMPACT_OPTIONS} />
        <span className="text-xs text-slate-400">×</span>
        <Select value={impact} onChange={setImpact} className={`${inputClass} w-20`} options={PROB_IMPACT_OPTIONS} />
        <Select
          value={ownerId}
          onChange={setOwnerId}
          className={inputClass}
          options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <Plus size={13} />
          Add
        </button>
      </form>

      {openRisk && (
        <RiskDetailPanel projectId={projectId} risk={openRisk} members={members} onClose={() => setOpenRiskId(null)} onChanged={load} />
      )}
    </div>
  );
}
