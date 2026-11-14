'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileDown, ListPlus, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { downloadFile, memberName, type DistributionList } from '@/lib/files';
import type { ProjectDocument } from './DocumentsPanel';

interface MemberLite {
  id: string;
  role?: string;
  externalName: string | null;
  externalCompany?: string | null;
  user: { id: string; fullName: string } | null;
  contractor?: { name: string } | null;
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
const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`;

function memberLabel(m: MemberLite): string {
  return m.user?.fullName ?? m.externalName ?? m.contractor?.name ?? m.externalCompany ?? 'Unnamed';
}

/** Saved groups of recipients ("Design team", "Contractor and QS") so a
 * transmittal goes to the same people every time. */
function DistributionLists({ projectId, members, lists, onChanged }: { projectId: string; members: MemberLite[]; lists: DistributionList[]; onChanged: (l: DistributionList[]) => void }) {
  const { authedFetch } = useAuth();
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; memberIds: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!editing) return;
    setError(null);
    try {
      const body = { name: editing.name.trim(), description: editing.description.trim() || null, memberIds: editing.memberIds };
      onChanged(await authedFetch<DistributionList[]>(editing.id ? `/projects/${projectId}/distribution-lists/${editing.id}` : `/projects/${projectId}/distribution-lists`, { method: editing.id ? 'PUT' : 'POST', body }));
      setEditing(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the list.');
    }
  }

  async function remove(l: DistributionList) {
    if (!confirm(`Delete the distribution list "${l.name}"? Transmittals already sent are not affected.`)) return;
    try {
      onChanged(await authedFetch<DistributionList[]>(`/projects/${projectId}/distribution-lists/${l.id}`, { method: 'DELETE' }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the list.');
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <Users size={12} />
          Distribution lists
        </h3>
        {!editing && (
          <button onClick={() => setEditing({ name: '', description: '', memberIds: [] })} className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            <ListPlus size={13} />
            New list
          </button>
        )}
      </div>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {lists.length === 0 && !editing && <p className="text-xs text-slate-400">No lists yet. Make one for the people who receive the same issues every time.</p>}
      <ul className="space-y-1.5">
        {lists.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800/50">
            <div className="min-w-0">
              <p className="font-medium text-slate-700 dark:text-slate-200">{l.name}</p>
              <p className="text-slate-400">{l.members.map((m) => memberName(m.projectMember)).join(', ') || 'No one yet'}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => setEditing({ id: l.id, name: l.name, description: l.description ?? '', memberIds: l.members.map((m) => m.projectMember.id) })} aria-label={`Edit ${l.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700">
                <Pencil size={12} />
              </button>
              <button onClick={() => remove(l)} aria-label={`Delete ${l.name}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                <Trash2 size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <input aria-label="List name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="List name (e.g. Design team)" maxLength={80} className={`${inputClass} w-full`} />
          <input aria-label="What it is for" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="What it is for (optional)" maxLength={500} className={`${inputClass} w-full`} />
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = editing.memberIds.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={on} onClick={() => setEditing({ ...editing, memberIds: on ? editing.memberIds.filter((x) => x !== m.id) : [...editing.memberIds, m.id] })} className={chip(on)}>
                  {memberLabel(m)}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.name.trim() || editing.memberIds.length === 0} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              Save list
            </button>
            <button onClick={() => setEditing(null)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransmittalsPanel({ projectId }: { projectId: string }) {
  const { authedFetch, accessToken, user } = useAuth();
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const [transmittals, setTransmittals] = useState<Transmittal[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [lists, setLists] = useState<DistributionList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [listIds, setListIds] = useState<string[]>([]);
  const [revisionIds, setRevisionIds] = useState<string[]>([]);
  const [docFilter, setDocFilter] = useState('');
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
    if (internal) authedFetch<DistributionList[]>(`/projects/${projectId}/distribution-lists`).then(setLists).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, internal]);

  const toggle = (set: (f: (p: string[]) => string[]) => void, id: string) => set((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function create() {
    if (!revisionIds.length) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/transmittals`, {
        method: 'POST',
        body: { purpose: purpose.trim() || undefined, recipientMemberIds: recipientIds, distributionListIds: listIds, documentRevisionIds: revisionIds },
      });
      setPurpose('');
      setRecipientIds([]);
      setListIds([]);
      setRevisionIds([]);
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

  const docOptions = useMemo(
    () =>
      documents
        .filter((d) => d.revisions[0])
        .filter((d) => !docFilter.trim() || d.name.toLowerCase().includes(docFilter.trim().toLowerCase()))
        .map((d) => ({ id: d.revisions[0].id, label: `${d.name} — Rev ${d.revisions[0].revisionNumber}` })),
    [documents, docFilter],
  );
  const fromLists = new Set(lists.filter((l) => listIds.includes(l.id)).flatMap((l) => l.members.map((m) => m.projectMember.id)));
  const recipientCount = new Set([...recipientIds, ...fromLists]).size;

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
                <button
                  onClick={() => downloadFile(`/projects/${projectId}/transmittals/${t.id}/pdf`, accessToken, `${t.transmittalNumber}.pdf`).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not make the slip.'))}
                  title="Transmittal slip (PDF)"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
                >
                  <FileDown size={12} />
                  Slip
                </button>
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
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800">
          <Plus size={14} />
          New transmittal
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <input aria-label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose (e.g. For Construction)" className={`${inputClass} w-full`} />
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">Documents ({revisionIds.length} chosen) — the current revision of each</p>
              <input aria-label="Filter" value={docFilter} onChange={(e) => setDocFilter(e.target.value)} placeholder="Filter…" className={`${inputClass} h-7 w-36 text-xs`} />
            </div>
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
              {docOptions.length === 0 && <p className="px-1 py-1 text-xs text-slate-400">No documents.</p>}
              {docOptions.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  <input type="checkbox" className="accent-emerald-600" checked={revisionIds.includes(o.id)} onChange={() => toggle(setRevisionIds, o.id)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          {lists.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-slate-400">Distribution lists</p>
              <div className="flex flex-wrap gap-1.5">
                {lists.map((l) => (
                  <button key={l.id} type="button" aria-pressed={listIds.includes(l.id)} onClick={() => toggle(setListIds, l.id)} className={chip(listIds.includes(l.id))}>
                    <Users size={11} className="mr-1 inline" />
                    {l.name} ({l.members.length})
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs text-slate-400">Other recipients</p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button key={m.id} type="button" aria-pressed={recipientIds.includes(m.id) || fromLists.has(m.id)} onClick={() => toggle(setRecipientIds, m.id)} disabled={fromLists.has(m.id)} title={fromLists.has(m.id) ? 'On a chosen list' : undefined} className={`${chip(recipientIds.includes(m.id) || fromLists.has(m.id))} disabled:opacity-60`}>
                  {memberLabel(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={create} disabled={saving || !revisionIds.length} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              {saving ? 'Creating…' : `Create for ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
            </button>
            <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {internal && <DistributionLists projectId={projectId} members={members} lists={lists} onChanged={setLists} />}
    </div>
  );
}
