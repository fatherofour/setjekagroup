'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from './CommentThread';

type RfiStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

interface MemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

interface Rfi {
  id: string;
  rfiNumber: string;
  title: string;
  question: string | null;
  officialResponse: string | null;
  status: RfiStatus;
  dueDate: string | null;
  raisedBy: MemberLite | null;
  assignedTo: MemberLite | null;
  ballInCourt: MemberLite | null;
  costImpactPotential: number | null;
  costImpactConfirmed: number | null;
  scheduleImpactPotentialDays: number | null;
  scheduleImpactConfirmedDays: number | null;
}

const STATUS_LABEL: Record<RfiStatus, string> = { OPEN: 'Open', ANSWERED: 'Answered', CLOSED: 'Closed' };
const STATUS_DOT: Record<RfiStatus, string> = { OPEN: 'bg-red-500', ANSWERED: 'bg-blue-500', CLOSED: 'bg-slate-400' };

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function memberLabel(m: MemberLite | null): string {
  if (!m) return '—';
  return m.user?.fullName ?? m.externalName ?? '—';
}

function RfiDetailPanel({
  projectId,
  rfi,
  members,
  onClose,
  onChanged,
}: {
  projectId: string;
  rfi: Rfi;
  members: MemberLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState({
    title: rfi.title,
    question: rfi.question ?? '',
    dueDate: rfi.dueDate ? rfi.dueDate.slice(0, 10) : '',
    raisedById: rfi.raisedBy?.id ?? '',
    assignedToId: rfi.assignedTo?.id ?? '',
    costImpactPotential: rfi.costImpactPotential ?? '',
    costImpactConfirmed: rfi.costImpactConfirmed ?? '',
    scheduleImpactPotentialDays: rfi.scheduleImpactPotentialDays ?? '',
    scheduleImpactConfirmedDays: rfi.scheduleImpactConfirmedDays ?? '',
  });
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/rfis/${rfi.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          question: form.question || null,
          dueDate: form.dueDate || null,
          raisedById: form.raisedById || null,
          assignedToId: form.assignedToId || null,
          costImpactPotential: form.costImpactPotential === '' ? null : Number(form.costImpactPotential),
          costImpactConfirmed: form.costImpactConfirmed === '' ? null : Number(form.costImpactConfirmed),
          scheduleImpactPotentialDays: form.scheduleImpactPotentialDays === '' ? null : Number(form.scheduleImpactPotentialDays),
          scheduleImpactConfirmedDays: form.scheduleImpactConfirmedDays === '' ? null : Number(form.scheduleImpactConfirmedDays),
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save RFI.');
    } finally {
      setSaving(false);
    }
  }

  async function respond() {
    if (!responseText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/rfis/${rfi.id}/respond`, { method: 'PATCH', body: { officialResponse: responseText.trim() } });
      setResponseText('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to respond to RFI.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rfi.rfiNumber}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
          <span className="font-medium text-slate-500 dark:text-slate-400">Ball in court: </span>
          <span className="font-medium text-slate-800 dark:text-slate-100">{memberLabel(rfi.ballInCourt)}</span>
        </div>

        <div className="space-y-3">
          <input className={`${inputClass} h-9 w-full`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea
            className="h-16 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="Question"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Raised by</label>
              <Select
                className={inputClass}
                value={form.raisedById}
                onChange={(v) => setForm({ ...form, raisedById: v })}
                options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Assigned to</label>
              <Select
                className={inputClass}
                value={form.assignedToId}
                onChange={(v) => setForm({ ...form, assignedToId: v })}
                options={[{ value: '', label: '— Unassigned —' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
              />
            </div>
          </div>
          <input type="date" className={`${inputClass} w-full`} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />

          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Impact</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className={inputClass}
                placeholder="Cost impact (potential)"
                value={form.costImpactPotential}
                onChange={(e) => setForm({ ...form, costImpactPotential: e.target.value })}
              />
              <input
                type="number"
                className={inputClass}
                placeholder="Cost impact (confirmed)"
                value={form.costImpactConfirmed}
                onChange={(e) => setForm({ ...form, costImpactConfirmed: e.target.value })}
              />
              <input
                type="number"
                className={inputClass}
                placeholder="Schedule days (potential)"
                value={form.scheduleImpactPotentialDays}
                onChange={(e) => setForm({ ...form, scheduleImpactPotentialDays: e.target.value })}
              />
              <input
                type="number"
                className={inputClass}
                placeholder="Schedule days (confirmed)"
                value={form.scheduleImpactConfirmedDays}
                onChange={(e) => setForm({ ...form, scheduleImpactConfirmedDays: e.target.value })}
              />
            </div>
          </div>

          <button onClick={save} disabled={saving} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Official response</p>
          {rfi.officialResponse ? (
            <p className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{rfi.officialResponse}</p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                className="h-16 flex-1 resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Write the official response…"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />
              <button
                onClick={respond}
                disabled={saving || !responseText.trim()}
                className="flex h-8 items-center gap-1 rounded-md bg-emerald-700 px-2.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Send size={12} />
                Respond
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CommentThread projectId={projectId} entityType="RFI" entityId={rfi.id} />
        </div>
      </div>
    </div>
  );
}

export function RfisPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [rfis, setRfis] = useState<Rfi[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [openRfiId, setOpenRfiId] = useState<string | null>(null);

  const load = () => {
    authedFetch<Rfi[]>(`/projects/${projectId}/rfis`)
      .then(setRfis)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load RFIs.'));
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
      await authedFetch(`/projects/${projectId}/rfis`, { method: 'POST', body: { title: title.trim(), assignedToId: assignedToId || undefined } });
      setTitle('');
      setAssignedToId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add RFI.');
    } finally {
      setSaving(false);
    }
  }

  const openRfi = rfis?.find((r) => r.id === openRfiId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">RFIs</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {rfis === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rfis.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No RFIs yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {rfis.map((r) => (
            <li key={r.id}>
              <button onClick={() => setOpenRfiId(r.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} />
                <span className="shrink-0 text-xs text-slate-400">{r.rfiNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.title}</span>
                <span className="shrink-0 text-xs text-slate-400">Ball: {memberLabel(r.ballInCourt)}</span>
                <span className="shrink-0 text-xs text-slate-400">{STATUS_LABEL[r.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New RFI title" className={`${inputClass} flex-1`} />
        <Select
          value={assignedToId}
          onChange={setAssignedToId}
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

      {openRfi && <RfiDetailPanel projectId={projectId} rfi={openRfi} members={members} onClose={() => setOpenRfiId(null)} onChanged={load} />}
    </div>
  );
}
