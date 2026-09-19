'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Star, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { OrganisationContact } from '@/lib/contractors';

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const checkClass = 'flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300';

export function OrganisationContactsTab({ contractorId, onChange }: { contractorId: string; onChange?: () => void }) {
  const { authedFetch } = useAuth();
  const [contacts, setContacts] = useState<OrganisationContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [canReceiveRfqs, setCanReceiveRfqs] = useState(false);
  const [canReceiveCorrespondence, setCanReceiveCorrespondence] = useState(false);
  const [canReceivePaymentNotifications, setCanReceivePaymentNotifications] = useState(false);

  const load = async () => {
    try {
      const data = await authedFetch<OrganisationContact[]>(`/contractors/${contractorId}/contacts`);
      setContacts(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load contacts.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractorId}/contacts`, {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          jobTitle: jobTitle.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          isPrimary,
          canReceiveRfqs,
          canReceiveCorrespondence,
          canReceivePaymentNotifications,
        },
      });
      setFullName('');
      setJobTitle('');
      setEmail('');
      setPhone('');
      setIsPrimary(false);
      setCanReceiveRfqs(false);
      setCanReceiveCorrespondence(false);
      setCanReceivePaymentNotifications(false);
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add contact.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/contractors/${contractorId}/contacts/${id}`, { method: 'DELETE' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove contact.');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Contacts</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {contacts === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No contacts added yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {contacts.map((c) => (
            <li key={c.id} className="group/contact flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {c.isPrimary && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
                  {c.fullName}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {[c.jobTitle, c.email, c.phone].filter(Boolean).join(' · ') || 'No details'}
                </p>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/contact:opacity-100 dark:hover:bg-red-950"
                aria-label={`Remove ${c.fullName}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className={`${inputClass} flex-1`} />
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job title" className={`${inputClass} flex-1`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className={`${inputClass} flex-1`} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={`${inputClass} flex-1`} />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className={checkClass}>
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            Primary contact
          </label>
          <label className={checkClass}>
            <input type="checkbox" checked={canReceiveRfqs} onChange={(e) => setCanReceiveRfqs(e.target.checked)} />
            Can receive RFQs
          </label>
          <label className={checkClass}>
            <input type="checkbox" checked={canReceiveCorrespondence} onChange={(e) => setCanReceiveCorrespondence(e.target.checked)} />
            Can receive correspondence
          </label>
          <label className={checkClass}>
            <input type="checkbox" checked={canReceivePaymentNotifications} onChange={(e) => setCanReceivePaymentNotifications(e.target.checked)} />
            Can receive payment notifications
          </label>
        </div>
        <button
          type="submit"
          disabled={saving || !fullName.trim()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <UserPlus size={13} />
          Add contact
        </button>
      </form>
    </div>
  );
}
