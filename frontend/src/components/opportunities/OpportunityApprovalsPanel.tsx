'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';

type ApprovalStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

interface Approval {
  id: string;
  approvalType: string;
  status: ApprovalStatus;
  dueDate: string | null;
  evidenceNotes: string | null;
  owner: { id: string; fullName: string } | null;
}

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
const STATUS_DOT: Record<ApprovalStatus, string> = {
  PENDING: 'bg-slate-400',
  SUBMITTED: 'bg-blue-500',
  APPROVED: 'bg-emerald-500',
  REJECTED: 'bg-red-500',
};

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function OpportunityApprovalsPanel({ opportunityId }: { opportunityId: string }) {
  const { authedFetch } = useAuth();
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalType, setApprovalType] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    authedFetch<Approval[]>(`/opportunities/${opportunityId}/approvals`)
      .then(setApprovals)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load approvals.'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!approvalType.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/opportunities/${opportunityId}/approvals`, {
        method: 'POST',
        body: { approvalType: approvalType.trim(), dueDate: dueDate || undefined },
      });
      setApprovalType('');
      setDueDate('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add approval.');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: ApprovalStatus) {
    try {
      await authedFetch(`/opportunities/${opportunityId}/approvals/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update approval.');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <ShieldCheck size={14} />
        Authority approvals
      </h2>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {approvals === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : approvals.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No approvals tracked yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {approvals.map((a) => (
            <li key={a.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{a.approvalType}</span>
                {a.dueDate && <span className="text-xs text-slate-400">Due {new Date(a.dueDate).toLocaleDateString()}</span>}
                <Select
                  value={a.status}
                  onChange={(v) => setStatus(a.id, v as ApprovalStatus)}
                  className={`${inputClass} ml-auto`}
                  options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                />
              </div>
              {a.owner && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Owner: {a.owner.fullName}</p>}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <input
          value={approvalType}
          onChange={(e) => setApprovalType(e.target.value)}
          placeholder="e.g. Planning, Environmental"
          className={`${inputClass} flex-1`}
        />
        <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button
          type="submit"
          disabled={saving || !approvalType.trim()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <Plus size={13} />
          Add
        </button>
      </form>
    </div>
  );
}
