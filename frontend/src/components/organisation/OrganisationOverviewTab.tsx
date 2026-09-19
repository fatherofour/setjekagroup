'use client';

import { useMemo, useState } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { ContractorDetail } from '@/lib/contractors';
import {
  CLASSIFICATIONS,
  CLASSIFICATION_LABEL,
  DISCIPLINE_SUGGESTIONS,
  REGISTRATION_STATUSES,
  REGISTRATION_STATUS_LABEL,
  PREQUALIFICATION_STATUSES,
  PREQUALIFICATION_STATUS_LABEL,
  type OrganisationClassification,
} from '@/lib/organisationMeta';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { TagInput } from '@/components/ui/TagInput';
import { Select } from '@/components/ui/Select';

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

interface Form {
  tradingName: string;
  registrationNumber: string;
  taxVatNumber: string;
  country: string;
  stateProvince: string;
  city: string;
  yearEstablished: string;
  website: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  classifications: OrganisationClassification[];
  disciplines: string[];
}

function toForm(c: ContractorDetail): Form {
  return {
    tradingName: c.tradingName ?? '',
    registrationNumber: c.registrationNumber ?? '',
    taxVatNumber: c.taxVatNumber ?? '',
    country: c.country ?? '',
    stateProvince: c.stateProvince ?? '',
    city: c.city ?? '',
    yearEstablished: c.yearEstablished != null ? String(c.yearEstablished) : '',
    website: c.website ?? '',
    contactName: c.contactName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
    classifications: c.classifications,
    disciplines: c.disciplines,
  };
}

export function OrganisationOverviewTab({ contractor, onSaved }: { contractor: ContractorDetail; onSaved: () => Promise<void> | void }) {
  const { authedFetch } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(() => toForm(contractor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [regStatus, setRegStatus] = useState(contractor.registrationStatus);
  const [preStatus, setPreStatus] = useState(contractor.prequalificationStatus);
  const [statusComment, setStatusComment] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const disciplineSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of form.classifications) for (const d of DISCIPLINE_SUGGESTIONS[c] ?? []) set.add(d);
    return Array.from(set);
  }, [form.classifications]);

  function startEdit() {
    setForm(toForm(contractor));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractor.id}`, {
        method: 'PATCH',
        body: {
          tradingName: form.tradingName.trim() || null,
          registrationNumber: form.registrationNumber.trim() || null,
          taxVatNumber: form.taxVatNumber.trim() || null,
          country: form.country.trim() || null,
          stateProvince: form.stateProvince.trim() || null,
          city: form.city.trim() || null,
          yearEstablished: form.yearEstablished.trim() ? Number(form.yearEstablished) : null,
          website: form.website.trim() || null,
          contactName: form.contactName.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          classifications: form.classifications,
          disciplines: form.disciplines,
        },
      });
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    setStatusSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractor.id}/status`, {
        method: 'PATCH',
        body: { registrationStatus: regStatus, prequalificationStatus: preStatus, comment: statusComment.trim() || undefined },
      });
      setStatusComment('');
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status.');
    } finally {
      setStatusSaving(false);
    }
  }

  const statusChanged = regStatus !== contractor.registrationStatus || preStatus !== contractor.prequalificationStatus;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Organisation details</h2>
          {editing ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <X size={13} />
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
              >
                <Check size={13} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Classification</p>
              <ToggleChips
                options={CLASSIFICATIONS.map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))}
                selected={form.classifications}
                onChange={(v) => setForm({ ...form, classifications: v as OrganisationClassification[] })}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Disciplines / categories</p>
              <TagInput values={form.disciplines} onChange={(v) => setForm({ ...form, disciplines: v })} suggestions={disciplineSuggestions} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Trading name</label>
                <input className={inputClass} value={form.tradingName} onChange={(e) => setForm({ ...form, tradingName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Registration number</label>
                <input className={inputClass} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Tax / VAT number</label>
                <input className={inputClass} value={form.taxVatNumber} onChange={(e) => setForm({ ...form, taxVatNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Country</label>
                <input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">State / Province</label>
                <input className={inputClass} value={form.stateProvince} onChange={(e) => setForm({ ...form, stateProvince: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">City</label>
                <input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Year established</label>
                <input type="number" className={inputClass} value={form.yearEstablished} onChange={(e) => setForm({ ...form, yearEstablished: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Website</label>
                <input className={inputClass} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Contact name</label>
                <input className={inputClass} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">General email</label>
                <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">General phone</label>
                <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500">Physical address</label>
                <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs text-slate-400 dark:text-slate-500">Notes</label>
                <textarea className={`${inputClass} h-16 resize-none py-2`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Trading name" value={contractor.tradingName ?? ''} />
            <Field label="Registration number" value={contractor.registrationNumber ?? ''} />
            <Field label="Tax / VAT number" value={contractor.taxVatNumber ?? ''} />
            <Field label="Location" value={[contractor.city, contractor.stateProvince, contractor.country].filter(Boolean).join(', ')} />
            <Field label="Year established" value={contractor.yearEstablished != null ? String(contractor.yearEstablished) : ''} />
            <Field label="Website" value={contractor.website ?? ''} />
            <Field label="Contact name" value={contractor.contactName ?? ''} />
            <Field label="General email" value={contractor.email ?? ''} />
            <Field label="General phone" value={contractor.phone ?? ''} />
            <Field label="Physical address" value={contractor.address ?? ''} />
            <Field label="Disciplines" value={contractor.disciplines.join(', ')} />
            {contractor.notes && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-slate-400 dark:text-slate-500">Notes</p>
                <p className="text-sm text-slate-800 dark:text-slate-100">{contractor.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Registration &amp; prequalification</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-slate-400 dark:text-slate-500">Registration status</label>
            <Select value={regStatus} onChange={(v) => setRegStatus(v as typeof regStatus)} options={REGISTRATION_STATUSES.map((s) => ({ value: s, label: REGISTRATION_STATUS_LABEL[s] }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 dark:text-slate-500">Prequalification status</label>
            <Select value={preStatus} onChange={(v) => setPreStatus(v as typeof preStatus)} options={PREQUALIFICATION_STATUSES.map((s) => ({ value: s, label: PREQUALIFICATION_STATUS_LABEL[s] }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 dark:text-slate-500">Comment</label>
            <input className={inputClass} value={statusComment} onChange={(e) => setStatusComment(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <button
          onClick={changeStatus}
          disabled={!statusChanged || statusSaving}
          className="mt-3 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {statusSaving ? 'Saving…' : 'Change status'}
        </button>

        {contractor.statusHistory.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">History</p>
            <ul className="space-y-2">
              {contractor.statusHistory.map((h) => (
                <li key={h.id} className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{h.previousStatus}</span> →{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">{h.newStatus}</span>
                  {' · '}
                  {new Date(h.changedAt).toLocaleString()}
                  {h.comment && <span className="italic"> — "{h.comment}"</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
