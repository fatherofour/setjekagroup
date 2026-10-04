'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { EvidenceFiles } from './EvidenceFiles';

type Status = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
type Category = 'ZONING' | 'ENVIRONMENTAL' | 'INFRASTRUCTURE' | 'LEGAL' | 'OTHER';

interface LandRight {
  id: string;
  approvalType: string;
  category: Category | null;
  authority: string | null;
  reference: string | null;
  status: Status;
  dueDate: string | null;
  evidenceNotes: string | null;
  site: { id: string; name: string } | null;
}

const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: 'ZONING', label: 'Zoning', hint: 'Rezoning, consent use, township establishment, SDP' },
  { value: 'ENVIRONMENTAL', label: 'Environmental', hint: 'EIA / basic assessment, water use licence, heritage' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure & external services', hint: 'Bulk water, sewer, electricity, roads & access' },
  { value: 'LEGAL', label: 'Legal', hint: 'Title, servitudes, restrictive conditions, subdivision / consolidation' },
  { value: 'OTHER', label: 'Other', hint: '' },
];

const STATUS: { value: Status; label: string }[] = [
  { value: 'PENDING', label: 'Not yet submitted' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Granted' },
  { value: 'REJECTED', label: 'Refused' },
];

const STATUS_DOT: Record<Status, string> = { PENDING: 'bg-slate-400', SUBMITTED: 'bg-blue-500', APPROVED: 'bg-emerald-500', REJECTED: 'bg-red-500' };

/** PROCSA 0.5 "Manage procurement of land rights including necessary
 * zoning, environmental, infrastructural / external services, legal
 * requirements" — the register's DEV R11 "Authority approvals" with
 * status, owner, due date and evidence. */
export function LandRightsPanel({ opportunityId, sites, readOnly, onChange }: { opportunityId: string; sites: { id: string; name: string; status: string }[]; readOnly: boolean; onChange: () => void }) {
  const { authedFetch } = useAuth();
  const [items, setItems] = useState<LandRight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = sites.find((s) => s.status === 'SELECTED');
  const [form, setForm] = useState({ approvalType: '', category: 'ZONING', siteId: selected?.id ?? '', authority: '', dueDate: '' });
  const base = `/opportunities/${opportunityId}/approvals`;

  const load = () =>
    authedFetch<LandRight[]>(base)
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load land rights.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function run(fn: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      await fn();
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        authedFetch(base, {
          method: 'POST',
          body: {
            approvalType: form.approvalType.trim(),
            category: form.category,
            siteId: form.siteId || undefined,
            authority: form.authority.trim() || undefined,
            dueDate: form.dueDate || undefined,
          },
        }),
      'Failed to add.',
    );
    setAdding(false);
    setForm({ approvalType: '', category: 'ZONING', siteId: selected?.id ?? '', authority: '', dueDate: '' });
  }

  const granted = items?.filter((i) => i.status === 'APPROVED').length ?? 0;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ShieldCheck size={14} />
            Land rights &amp; authority approvals <span className="font-normal text-slate-400">· PROCSA 0.5</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {items?.length ? `${granted} of ${items.length} granted. ` : ''}Every zoning, environmental, infrastructure and legal right the site needs, with the authority, status and evidence.
          </p>
        </div>
        {!readOnly && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
            <Plus size={14} />
            Add land right
          </button>
        )}
      </div>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {adding && (
        <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
          <div>
            <label className={labelClass} htmlFor="lr-category">
              Category
            </label>
            <Select id="lr-category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} className={inputClass} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
            <p className="mt-1 text-[11px] text-slate-400">{CATEGORIES.find((c) => c.value === form.category)?.hint}</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="lr-type">
              Right / approval <span className="text-red-500">*</span>
            </label>
            <input id="lr-type" className={inputClass} placeholder="e.g. Rezoning to Business 4" value={form.approvalType} onChange={(e) => setForm({ ...form, approvalType: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="lr-site">
              Site
            </label>
            <Select id="lr-site" value={form.siteId} onChange={(v) => setForm({ ...form, siteId: v })} className={inputClass} options={[{ value: '', label: '—' }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
          </div>
          <div>
            <label className={labelClass} htmlFor="lr-authority">
              Authority
            </label>
            <input id="lr-authority" className={inputClass} placeholder="e.g. City of Johannesburg" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="lr-due">
              Needed by
            </label>
            <input id="lr-due" type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={!form.approvalType.trim()} className={primaryButton}>
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {items === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        !adding && <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No land rights tracked yet.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {CATEGORIES.filter((c) => items.some((i) => (i.category ?? 'OTHER') === c.value)).map((c) => (
            <div key={c.value}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{c.label}</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {items
                  .filter((i) => (i.category ?? 'OTHER') === c.value)
                  .map((i) => (
                    <li key={i.id} className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[i.status]}`} />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{i.approvalType}</span>
                        <span className="text-xs text-slate-500">{[i.authority, i.site?.name, i.reference && `ref ${i.reference}`, i.dueDate && `needed by ${new Date(i.dueDate).toLocaleDateString()}`].filter(Boolean).join(' · ')}</span>
                        {!readOnly && (
                          <div className="ml-auto flex items-center gap-1">
                            <div className="w-40">
                              <Select
                                aria-label={`Status of ${i.approvalType}`}
                                value={i.status}
                                onChange={(v) => run(() => authedFetch(`${base}/${i.id}`, { method: 'PATCH', body: { status: v } }), 'Failed to update.')}
                                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                options={STATUS}
                              />
                            </div>
                            <button
                              type="button"
                              aria-label={`Delete ${i.approvalType}`}
                              onClick={() => confirm(`Delete ${i.approvalType}?`) && run(() => authedFetch(`${base}/${i.id}`, { method: 'DELETE' }), 'Failed to delete.')}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                        {readOnly && <span className="ml-auto text-xs text-slate-500">{STATUS.find((s) => s.value === i.status)?.label}</span>}
                      </div>
                      <div className="mt-1.5 pl-4">
                        <EvidenceFiles opportunityId={opportunityId} linkType="APPROVAL" linkId={i.id} readOnly={readOnly} compact />
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
