'use client';

import { useEffect, useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import type { ProjectDocument } from './DocumentsPanel';

interface MemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

interface Transmittal {
  id: string;
  transmittalNumber: string;
  purpose: string | null;
  status: 'DRAFT' | 'ISSUED';
  issuedAt: string | null;
  createdBy: { fullName: string };
  recipients: { member: MemberLite }[];
  items: { documentRevision: { revisionNumber: string; document: { name: string } } }[];
}

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function memberLabel(m: MemberLite): string {
  return m.user?.fullName ?? m.externalName ?? 'Unnamed';
}

export function TransmittalsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [transmittals, setTransmittals] = useState<Transmittal[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [revisionId, setRevisionId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    authedFetch<Transmittal[]>(`/projects/${projectId}/transmittals`)
      .then(setTransmittals)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load transmittals.'));
  };

  useEffect(() => {
    load();
    authedFetch<MemberLite[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    authedFetch<ProjectDocument[]>(`/projects/${projectId}/documents`).then(setDocuments).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function toggleRecipient(id: string) {
    setRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create() {
    if (!revisionId) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/transmittals`, {
        method: 'POST',
        body: { purpose: purpose.trim() || undefined, recipientMemberIds: recipientIds, documentRevisionIds: [revisionId] },
      });
      setPurpose('');
      setRecipientIds([]);
      setRevisionId('');
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create transmittal.');
    } finally {
      setSaving(false);
    }
  }

  async function issue(id: string) {
    try {
      await authedFetch(`/projects/${projectId}/transmittals/${id}/issue`, { method: 'PATCH' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to issue transmittal.');
    }
  }

  const revisionOptions = documents.flatMap((d) => d.revisions.slice(0, 1).map((r) => ({ value: r.id, label: `${d.name} — Rev ${r.revisionNumber}` })));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Transmittals</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {transmittals === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : transmittals.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No transmittals yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {transmittals.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {t.transmittalNumber} {t.purpose && <span className="font-normal text-slate-500">· {t.purpose}</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {t.items.map((i) => `${i.documentRevision.document.name} (Rev ${i.documentRevision.revisionNumber})`).join(', ')} → {t.recipients.map((r) => memberLabel(r.member)).join(', ') || 'no recipients'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.status === 'ISSUED' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {t.status}
                </span>
                {t.status === 'DRAFT' && (
                  <button onClick={() => issue(t.id)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    <Send size={12} />
                    Issue
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          <Plus size={14} />
          New transmittal
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose (e.g. For Construction)" className={`${inputClass} w-full`} />
          <Select value={revisionId} onChange={setRevisionId} className={`${inputClass} w-full`} options={[{ value: '', label: 'Choose a document…' }, ...revisionOptions]} />
          <div>
            <p className="mb-1 text-xs text-slate-400">Recipients</p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggleRecipient(m.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${recipientIds.includes(m.id) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                >
                  {memberLabel(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={saving || !revisionId} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
