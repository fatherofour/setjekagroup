'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronDown, ListTodo, Plus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { memberLabel, type MemberRef } from '@/lib/inception';
import { CommentThread } from './CommentThread';

type MeetingType = 'INITIATION' | 'DESIGN' | 'CONSULTANTS' | 'CLIENT' | 'SITE' | 'OTHER';

interface Meeting {
  id: string;
  title: string;
  meetingType: MeetingType;
  scheduledAt: string;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  status: 'SCHEDULED' | 'HELD' | 'CANCELLED';
  minutesIssuedAt: string | null;
  createdBy: { fullName: string };
  attendees: { id: string; projectMemberId: string; present: boolean | null; projectMember: MemberRef }[];
  actionItems: { id: string; title: string; status: string; dueDate: string | null; assignedTo: MemberRef | null }[];
}

const TYPE_LABEL: Record<MeetingType, string> = {
  INITIATION: 'Project initiation',
  DESIGN: 'Design',
  CONSULTANTS: 'Consultants',
  CLIENT: 'Client',
  SITE: 'Site',
  OTHER: 'Other',
};

const STATUS_TONE = {
  SCHEDULED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HELD: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
} as const;

type CarriedAction = Meeting['actionItems'][number] & { from: string };

function MeetingCard({
  projectId,
  meeting,
  members,
  broughtForward,
  onChange,
}: {
  projectId: string;
  meeting: Meeting;
  members: MemberRef[];
  broughtForward: CarriedAction[];
  onChange: (m?: Meeting) => void;
}) {
  const { authedFetch } = useAuth();
  const [open, setOpen] = useState(meeting.status === 'SCHEDULED');
  const [minutes, setMinutes] = useState(meeting.minutes ?? '');
  const [action, setAction] = useState({ title: '', assignedToId: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/meetings/${meeting.id}`;

  async function run(fn: () => Promise<Meeting | void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await fn();
      onChange(updated || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const setPresence = (memberId: string, present: boolean | null) =>
    run(() => authedFetch<Meeting>(`${base}/attendance`, { method: 'POST', body: { entries: [{ projectMemberId: memberId, present }] } }), 'Failed to record attendance.');

  const saveMinutes = () => run(() => authedFetch<Meeting>(base, { method: 'PATCH', body: { minutes: minutes.trim() || null } }), 'Failed to save minutes.');

  const issueMinutes = () =>
    run(async () => {
      await authedFetch(base, { method: 'PATCH', body: { minutes: minutes.trim() || null } });
      return authedFetch<Meeting>(`${base}/issue-minutes`, { method: 'POST' });
    }, 'Failed to issue minutes.');

  const addAction = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const m = await authedFetch<Meeting>(`${base}/action-items`, {
        method: 'POST',
        body: { title: action.title.trim(), assignedToId: action.assignedToId || undefined, dueDate: action.dueDate || undefined },
      });
      setAction({ title: '', assignedToId: '', dueDate: '' });
      return m;
    }, 'Failed to add the action item.');
  };

  const invitedIds = meeting.attendees.map((a) => a.projectMemberId);

  return (
    <div className={cardClass}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{meeting.title}</span>
        <span className="text-xs text-slate-400">{TYPE_LABEL[meeting.meetingType]}</span>
        <span className="ml-auto text-xs tabular-nums text-slate-500">{new Date(meeting.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[meeting.status]}`}>
          {meeting.status === 'HELD' && meeting.minutesIssuedAt ? 'Minutes issued' : meeting.status.toLowerCase()}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
          {(meeting.location || meeting.agenda) && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {meeting.location && <p className="text-xs text-slate-500">Location: {meeting.location}</p>}
              {meeting.agenda && <p className="mt-1 whitespace-pre-line">{meeting.agenda}</p>}
            </div>
          )}

          <div>
            <p className={labelClass}>Attendance ({meeting.attendees.filter((a) => a.present).length} of {meeting.attendees.length} present)</p>
            {meeting.attendees.length === 0 ? (
              <p className="text-xs text-slate-400">Nobody invited.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {meeting.attendees.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{memberLabel(a.projectMember)}</span>
                    {(['present', 'absent'] as const).map((p) => {
                      const value = p === 'present';
                      const active = a.present === value;
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={busy}
                          onClick={() => setPresence(a.projectMemberId, active ? null : value)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            active
                              ? value
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-500 bg-slate-500 text-white'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          {p === 'present' ? 'Present' : 'Absent'}
                        </button>
                      );
                    })}
                  </li>
                ))}
              </ul>
            )}
            {members.filter((m) => !invitedIds.includes(m.id)).length > 0 && meeting.status === 'SCHEDULED' && (
              <div className="mt-2 w-72">
                <Select
                  aria-label="Invite another team member"
                  value=""
                  onChange={(v) => v && run(() => authedFetch<Meeting>(base, { method: 'PATCH', body: { attendeeIds: [...invitedIds, v] } }), 'Failed to invite.')}
                  className={`${inputClass} h-8 text-xs`}
                  options={[{ value: '', label: '+ Invite another team member…' }, ...members.filter((m) => !invitedIds.includes(m.id)).map((m) => ({ value: m.id, label: memberLabel(m) }))]}
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor={`minutes-${meeting.id}`}>
              Minutes
            </label>
            <textarea id={`minutes-${meeting.id}`} className={`${inputClass} h-28 resize-y py-2`} placeholder="Decisions, discussion points…" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={saveMinutes} className={secondaryButton}>
                Save minutes
              </button>
              <button type="button" disabled={busy || !minutes.trim()} onClick={issueMinutes} className={primaryButton}>
                <Send size={13} />
                {meeting.minutesIssuedAt ? 'Re-issue minutes' : 'Issue minutes to attendees'}
              </button>
            </div>
            {meeting.minutesIssuedAt && <p className="mt-1 text-xs text-slate-500">Issued {new Date(meeting.minutesIssuedAt).toLocaleString()}</p>}
          </div>

          {broughtForward.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
              <p className={`${labelClass} flex items-center gap-1`}>
                <ListTodo size={12} />
                Open actions brought forward ({broughtForward.length})
              </p>
              <ul className="divide-y divide-amber-100 dark:divide-amber-900/40">
                {broughtForward.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">{t.title}</span>
                    <span className="text-xs text-slate-500">{t.assignedTo ? memberLabel(t.assignedTo) : 'Unassigned'}</span>
                    {t.dueDate && <span className={`text-xs ${new Date(t.dueDate) < new Date() ? 'font-semibold text-red-600' : 'text-slate-400'}`}>due {new Date(t.dueDate).toLocaleDateString()}</span>}
                    <span className="w-full text-[11px] text-slate-400">from {t.from}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className={`${labelClass} flex items-center gap-1`}>
              <ListTodo size={12} />
              Action items — added to Tasks
            </p>
            {meeting.actionItems.length > 0 && (
              <ul className="mb-2 divide-y divide-slate-100 dark:divide-slate-800">
                {meeting.actionItems.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                    <span className={`min-w-0 flex-1 ${t.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{t.title}</span>
                    <span className="text-xs text-slate-500">{t.assignedTo ? memberLabel(t.assignedTo) : 'Unassigned'}</span>
                    {t.dueDate && <span className="text-xs text-slate-400">due {new Date(t.dueDate).toLocaleDateString()}</span>}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addAction} className="flex flex-wrap gap-2">
              <input aria-label="Action item" className={`${inputClass} h-8 min-w-[180px] flex-1 text-xs`} placeholder="Action item" value={action.title} onChange={(e) => setAction({ ...action, title: e.target.value })} />
              <div className="w-56">
                <Select aria-label="Action owner" value={action.assignedToId} onChange={(v) => setAction({ ...action, assignedToId: v })} className={`${inputClass} h-8 text-xs`} options={[{ value: '', label: 'Owner…' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]} />
              </div>
              <input aria-label="Due date" type="date" className={`${inputClass} h-8 w-36 text-xs`} value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })} />
              <button type="submit" disabled={busy || !action.title.trim()} className={`${secondaryButton} h-8`}>
                <Plus size={13} />
                Add
              </button>
            </form>
          </div>

          <div>
            <p className={labelClass}>Discussion</p>
            <CommentThread projectId={projectId} entityType="MEETING" entityId={meeting.id} />
          </div>

          <button
            type="button"
            onClick={() => confirm(`Delete "${meeting.title}"? Its action items stay in Tasks.`) && run(() => authedFetch<void>(base, { method: 'DELETE' }), 'Failed to delete.')}
            className="flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400"
          >
            <Trash2 size={12} />
            Delete meeting
          </button>
        </div>
      )}
    </div>
  );
}

/** Project meetings: PROCSA every consultant's 1.2 "Attend project
 * initiation meetings" and the register's CLI "Client communications". */
export function MeetingsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [members, setMembers] = useState<MemberRef[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: 'Project initiation meeting', meetingType: 'INITIATION', scheduledAt: '', location: '', agenda: '' });
  const [invitees, setInvitees] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    authedFetch<Meeting[]>(`/projects/${projectId}/meetings`)
      .then(setMeetings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load meetings.'));

  useEffect(() => {
    load();
    authedFetch<MemberRef[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function startCreate() {
    setCreating(true);
    setInvitees(new Set(members.map((m) => m.id)));
    // Tomorrow 10:00 local time, in the yyyy-MM-ddTHH:mm form datetime-local expects.
    const next = new Date();
    next.setDate(next.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T10:00`;
    setForm({ title: meetings?.length ? '' : 'Project initiation meeting', meetingType: meetings?.length ? 'CONSULTANTS' : 'INITIATION', scheduledAt: local, location: '', agenda: '' });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/meetings`, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          meetingType: form.meetingType,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          location: form.location.trim() || undefined,
          agenda: form.agenda.trim() || undefined,
          attendeeIds: [...invitees],
        },
      });
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to schedule the meeting.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CalendarClock size={14} />
              Meetings
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Initiation, design, consultant and client meetings — attendance, minutes and action items. Attending a held initiation meeting counts toward each consultant&apos;s PROCSA 1.2.
            </p>
          </div>
          {!creating && (
            <button type="button" onClick={startCreate} className={secondaryButton}>
              <Plus size={14} />
              Schedule meeting
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {creating && (
          <form onSubmit={create} className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="mtg-title">
                  Title
                </label>
                <input id="mtg-title" className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="mtg-type">
                  Type
                </label>
                <Select id="mtg-type" value={form.meetingType} onChange={(v) => setForm({ ...form, meetingType: v })} className={inputClass} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              </div>
              <div>
                <label className={labelClass} htmlFor="mtg-when">
                  When
                </label>
                <input id="mtg-when" type="datetime-local" className={inputClass} value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="mtg-where">
                  Location
                </label>
                <input id="mtg-where" className={inputClass} placeholder="Boardroom / Teams link" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="mtg-agenda">
                  Agenda
                </label>
                <textarea id="mtg-agenda" className={`${inputClass} h-20 resize-y py-2`} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
              </div>
            </div>
            <div>
              <p className={labelClass}>Invite ({invitees.size})</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = invitees.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setInvitees((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}
                    >
                      {memberLabel(m)}
                    </button>
                  );
                })}
                {members.length === 0 && <span className="text-xs text-slate-400">No team members yet — add them on the Team tab.</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving || !form.title.trim() || !form.scheduledAt} className={primaryButton}>
                {saving ? 'Scheduling…' : 'Schedule & notify invitees'}
              </button>
              <button type="button" onClick={() => setCreating(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {meetings === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : meetings.length === 0 ? (
        !creating && <p className="text-sm text-slate-400 dark:text-slate-500">No meetings yet.</p>
      ) : (
        meetings.map((m) => (
          <MeetingCard
            key={m.id}
            projectId={projectId}
            meeting={m}
            members={members}
            broughtForward={meetings
              .filter((x) => x.id !== m.id && new Date(x.scheduledAt) < new Date(m.scheduledAt))
              .flatMap((x) => x.actionItems.filter((t) => t.status !== 'DONE').map((t) => ({ ...t, from: `${x.title}, ${new Date(x.scheduledAt).toLocaleDateString()}` })))}
            onChange={(updated) => (updated ? setMeetings((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null) : load())}
          />
        ))
      )}
    </div>
  );
}
