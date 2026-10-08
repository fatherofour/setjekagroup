'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Camera, CalendarCheck, CalendarClock, CheckCircle2, ChevronDown, FileText, Gauge, History, MapPin, Stamp, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { PROJECT_STAGES } from '@/lib/projectStages';
import { formatRate } from '@/lib/commercial';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';
import { CommentThread } from '@/components/project/CommentThread';
import { SitePhotosPanel } from '@/components/photos/SitePhotosPanel';

interface PortalProject {
  project: { id: string; name: string; projectCode: string | null; description: string | null; stage: string; location: string | null; startDate: string | null; endDate: string | null; currency: string };
  programme: {
    percent: number;
    start: string;
    finish: string;
    activities: number;
    critical: number;
    behind: number;
    upcoming: { id: string; name: string; activityType: string; startDate: string; endDate: string; percentComplete: number; isCriticalPath: boolean }[];
  } | null;
  commercial: {
    currency: string;
    budgetLocked: boolean;
    originalBudget: number;
    approvedVariations: number;
    revisedBudget: number;
    committed: number;
    paid: number;
    forecastFinal: number;
    variance: number;
    contingencyRemaining: number;
    drawnPercent: number | null;
  } | null;
  milestones: { id: string; name: string; targetDate: string | null; actualDate: string | null; status: string }[];
  approvals: {
    documents: { key: string; title: string; version: number; submittedAt: string | null; submittedBy: string | null; note: string | null }[];
    variations: { id: string; number: string; title: string; description: string | null; reason: string; value: number; timeImpactDays: number | null; raisedBy: string; submittedAt: string | null }[];
    stageGate: { id: string; fromStage: string; toStage: string; comment: string | null; requestedBy: string; requestedAt: string } | null;
  };
  stageHistory: { toStage: string; decidedAt: string | null }[];
  decisions: { kind: string; title: string; outcome: string; by: string; at: string; comment: string | null }[];
  documents: { id: string; name: string; documentType: string | null; discipline: string | null; description: string | null; current: { id: string; revisionNumber: string; originalFilename: string; mimeType: string | null; uploadedAt: string } | null }[];
  meetings: { id: string; title: string; meetingType: string; scheduledAt: string; location: string | null; agenda: string | null; status: string; minutes: string | null; minutesIssuedAt: string | null }[];
  team: { name: string; role: string; email: string | null }[];
  notes: { id: string; body: string; author: string; isAction: boolean; actionStatus: string | null; dueDate: string | null; createdAt: string; acknowledgedAt: string | null }[];
}

const stageLabel = (v: string) => PROJECT_STAGES.find((s) => s.value === v)?.label ?? v;
const roleLabel = (r: string) => r.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const card = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const btn = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50';

function Section({ id, icon, title, children, defaultOpen = true }: { id?: string; icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className={`${card} scroll-mt-20`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <span className="text-emerald-700 dark:text-emerald-400">{icon}</span>
        <h2 className="flex-1 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

/** One decision card: approve, or reject / ask for changes with a reason. */
function Decision({ label, children, rejectLabel, onDecide }: { label: string; children: ReactNode; rejectLabel: string; onDecide: (approve: boolean, comment: string) => Promise<void> }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (approve: boolean) => {
    setBusy(true);
    try {
      await onDecide(approve, comment.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">{label}</p>
      <div className="mt-1 text-sm text-slate-800 dark:text-slate-100">{children}</div>
      <textarea
        aria-label="Your comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={`Comment (required to ${rejectLabel.toLowerCase()})`}
        className="mt-2 h-16 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => go(true)} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>
          <CheckCircle2 size={16} />
          Approve
        </button>
        <button type="button" disabled={busy || !comment.trim()} onClick={() => go(false)} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}>
          {rejectLabel}
        </button>
      </div>
    </li>
  );
}

/** Client portal — one project (mobile first). Register CLI: client
 * dashboard, client approvals with a recorded decision, client reporting and
 * client communications. Only the client can approve here (Meeting 3). */
export default function ClientProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { authedFetch, accessToken } = useAuth();
  const [data, setData] = useState<PortalProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null);
  const [openMinutes, setOpenMinutes] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<PortalProject>(`/client-portal/projects/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the project.'));
  }, [authedFetch, id]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = (path: string, method: 'POST' | 'PATCH', done: string) => async (approve: boolean, comment: string) => {
    setError(null);
    setMessage(null);
    try {
      await authedFetch(path, { method, body: { approve, comment: comment || undefined } });
      setMessage(`${done} ${approve ? 'approved' : 'sent back'} — your decision is recorded with your name and the time.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Your decision could not be recorded.');
    }
  };

  async function openDoc(d: PortalProject['documents'][number]) {
    if (!d.current) return;
    try {
      const url = await apiFetchBlobUrl(`/projects/${id}/documents/${d.id}/revisions/${d.current.id}/file`, accessToken);
      setPreview({ url, name: d.current.originalFilename, mime: d.current.mimeType });
    } catch {
      setError('That document could not be opened.');
    }
  }

  async function acknowledge(noteId: string) {
    await authedFetch(`/me/notes/${noteId}/acknowledge`, { method: 'POST' }).catch(() => {});
    load();
  }

  if (error && !data) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  const { project, programme, commercial, approvals } = data;
  const stageIdx = PROJECT_STAGES.findIndex((s) => s.value === project.stage);
  const waiting = approvals.documents.length + approvals.variations.length + (approvals.stageGate ? 1 : 0);
  const completion = project.endDate ?? programme?.finish ?? null;
  const upcomingMeetings = data.meetings.filter((m) => m.status === 'SCHEDULED');
  const pastMeetings = data.meetings.filter((m) => m.minutesIssuedAt);
  const newNotes = data.notes.filter((n) => !n.acknowledgedAt && !n.isAction);
  const myActions = data.notes.filter((n) => n.isAction && n.actionStatus === 'OPEN');

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} />
        Your projects
      </Link>

      <header className="rounded-2xl bg-emerald-900 p-5 text-white">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-200">{project.projectCode ?? 'Project'}</p>
        <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
        {project.location && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-100">
            <MapPin size={13} />
            {project.location}
          </p>
        )}
        <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Delivery stages">
          {PROJECT_STAGES.map((s, i) => (
            <li key={s.value} title={s.label} className={`h-1.5 rounded-full ${i < stageIdx ? 'bg-emerald-400' : i === stageIdx ? 'bg-white' : 'bg-emerald-700'}`} />
          ))}
        </ol>
        <p className="mt-2 text-sm">
          Stage {stageIdx} · <strong>{stageLabel(project.stage)}</strong>
        </p>
      </header>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <CalendarCheck size={12} />
            Completion
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{completion ? new Date(completion).toLocaleDateString() : '—'}</p>
        </div>
        <div className={card}>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Gauge size={12} />
            Programme
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{programme ? `${programme.percent}%` : '—'}</p>
          {programme && programme.behind > 0 && <p className="text-[11px] text-amber-700 dark:text-amber-400">{programme.behind} behind schedule</p>}
        </div>
        <div className={`${card} col-span-2 sm:col-span-1`}>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Wallet size={12} />
            Budget drawn
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{commercial?.drawnPercent != null ? `${commercial.drawnPercent}%` : '—'}</p>
          {commercial && <p className="text-[11px] text-slate-500">{formatRate(commercial.paid, commercial.currency)} paid</p>}
        </div>
      </div>

      {waiting > 0 && (
        <section className={`${card} ring-2 ring-amber-300 dark:ring-amber-800`}>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <Stamp size={18} className="text-amber-600" />
            Waiting for your decision ({waiting})
          </h2>
          <p className="mt-1 text-xs text-slate-500">Only you can approve these. Setjeka cannot decide on your behalf.</p>
          <ul className="mt-3 space-y-3">
            {approvals.stageGate && (
              <Decision
                label="Move to the next stage"
                rejectLabel="Reject"
                onDecide={decide(`/projects/${id}/stage-transitions/${approvals.stageGate.id}/decide`, 'PATCH', 'Stage move')}
              >
                <p>
                  {stageLabel(approvals.stageGate.fromStage)} → <strong>{stageLabel(approvals.stageGate.toStage)}</strong>
                </p>
                <p className="text-xs text-slate-500">
                  Requested by {approvals.stageGate.requestedBy}
                  {approvals.stageGate.comment && ` — ${approvals.stageGate.comment}`}
                </p>
              </Decision>
            )}
            {approvals.variations.map((v) => (
              <Decision key={v.id} label={`Variation ${v.number}`} rejectLabel="Reject" onDecide={decide(`/projects/${id}/commercial/variations/${v.id}/decide`, 'POST', `Variation ${v.number}`)}>
                <p className="font-medium">{v.title}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatRate(v.value, project.currency)}</p>
                {v.timeImpactDays != null && v.timeImpactDays !== 0 && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Time impact: {v.timeImpactDays} day{Math.abs(v.timeImpactDays) === 1 ? '' : 's'}
                  </p>
                )}
                {v.description && <p className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-300">{v.description}</p>}
                <p className="mt-1 text-xs text-slate-500">Raised by {v.raisedBy}. Approving adds it to the budget from the contingency.</p>
              </Decision>
            ))}
            {approvals.documents.map((d) => (
              <Decision key={d.key} label="Stage 1 document" rejectLabel="Request changes" onDecide={decide(`/projects/${id}/inception/deliverables/${d.key}/decide`, 'POST', d.title)}>
                <p className="font-medium">
                  {d.title} <span className="text-xs font-normal text-slate-500">v{d.version}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Submitted by {d.submittedBy ?? 'Setjeka'}
                  {d.submittedAt && ` on ${new Date(d.submittedAt).toLocaleDateString()}`}
                  {d.note && ` — "${d.note}"`}
                </p>
                <Link href={`/projects/${id}?tab=inception`} className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  Read the document in full →
                </Link>
              </Decision>
            ))}
          </ul>
        </section>
      )}

      {(myActions.length > 0 || newNotes.length > 0) && (
        <Section icon={<CheckCircle2 size={18} />} title="From Setjeka">
          <ul className="space-y-2">
            {myActions.map((n) => (
              <li key={n.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Action for you{n.dueDate && ` · due ${new Date(n.dueDate).toLocaleDateString()}`}</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{n.body}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{n.author}</span>
                  <button type="button" onClick={() => authedFetch(`/me/notes/${n.id}/action`, { method: 'PATCH', body: { status: 'DONE' } }).then(load).catch(() => {})} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Mark done
                  </button>
                </div>
              </li>
            ))}
            {newNotes.map((n) => (
              <li key={n.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{n.body}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {n.author} · {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                  <button type="button" onClick={() => acknowledge(n.id)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Got it
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {programme && (
        <Section icon={<Gauge size={18} />} title="Programme">
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${programme.percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {programme.percent}% complete · {new Date(programme.start).toLocaleDateString()} to {new Date(programme.finish).toLocaleDateString()} · {programme.activities} activities
          </p>
          {programme.upcoming.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Coming up</p>
              <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
                {programme.upcoming.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">
                      {a.name}
                      {a.activityType === 'MILESTONE' && <span className="ml-1.5 rounded bg-violet-50 px-1 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-300">milestone</span>}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">{new Date(a.startDate).toLocaleDateString()}</span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{a.percentComplete}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {data.milestones.length > 0 && (
        <Section icon={<CalendarCheck size={18} />} title="Milestones" defaultOpen={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">{m.name}</span>
                <span className="text-xs text-slate-500">{m.actualDate ? `done ${new Date(m.actualDate).toLocaleDateString()}` : m.targetDate ? `target ${new Date(m.targetDate).toLocaleDateString()}` : ''}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : m.status === 'OVERDUE' || m.status === 'SLIPPED' || m.status === 'COMPLETED_LATE' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {roleLabel(m.status)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {commercial && (
        <Section icon={<Wallet size={18} />} title="Budget">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ['Approved budget', commercial.originalBudget],
                ['Approved variations', commercial.approvedVariations],
                ['Current budget', commercial.revisedBudget],
                ['Paid to date', commercial.paid],
                ['Forecast final cost', commercial.forecastFinal],
                ['Contingency left', commercial.contingencyRemaining],
              ] as [string, number][]
            ).map(([label, v]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatRate(v, commercial.currency)}</dd>
              </div>
            ))}
          </dl>
          {commercial.variance < 0 && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">The forecast is {formatRate(-commercial.variance, commercial.currency)} over the current budget.</p>}
          {!commercial.budgetLocked && <p className="mt-2 text-xs text-slate-500">The budget is still being finalised by Setjeka.</p>}
        </Section>
      )}

      <Section id="documents" icon={<FileText size={18} />} title={`Documents & drawings (${data.documents.length})`} defaultOpen={data.documents.length > 0}>
        {data.documents.length === 0 ? (
          <p className="text-sm text-slate-400">Setjeka hasn&apos;t shared any documents with you yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.documents.map((d) => (
              <li key={d.id}>
                <button type="button" disabled={!d.current} onClick={() => openDoc(d)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <FileText size={18} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800 dark:text-slate-100">{d.name}</span>
                    <span className="block text-xs text-slate-500">{[d.documentType, d.discipline, d.current && `Rev ${d.current.revisionNumber}`, d.current && new Date(d.current.uploadedAt).toLocaleDateString()].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">View</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="photos" icon={<Camera size={18} />} title="Site photos">
        <SitePhotosPanel projectId={id} clientView />
      </Section>

      <Section id="meetings" icon={<CalendarClock size={18} />} title="Meetings" defaultOpen={upcomingMeetings.length > 0}>
        {upcomingMeetings.length === 0 && pastMeetings.length === 0 ? (
          <p className="text-sm text-slate-400">No meetings you&apos;re invited to.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingMeetings.map((m) => (
              <li key={m.id} className="rounded-xl bg-emerald-50/60 p-3 text-sm dark:bg-emerald-950/30">
                <p className="font-medium text-slate-900 dark:text-slate-100">{m.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  {m.location && ` · ${m.location}`}
                </p>
                {m.agenda && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{m.agenda}</p>}
              </li>
            ))}
            {pastMeetings.map((m) => (
              <li key={m.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                <button type="button" onClick={() => setOpenMinutes(openMinutes === m.id ? null : m.id)} className="flex w-full items-center gap-2 text-left">
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800 dark:text-slate-100">{m.title}</span>
                    <span className="block text-xs text-slate-500">{new Date(m.scheduledAt).toLocaleDateString()} · minutes issued</span>
                  </span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${openMinutes === m.id ? '' : '-rotate-90'}`} />
                </button>
                {openMinutes === m.id && <p className="mt-2 whitespace-pre-line text-xs text-slate-600 dark:text-slate-300">{m.minutes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<History size={18} />} title="Your decisions" defaultOpen={false}>
        {data.decisions.length === 0 ? (
          <p className="text-sm text-slate-400">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.decisions.map((d, i) => (
              <li key={i} className="py-2 text-sm">
                <p className="text-slate-800 dark:text-slate-100">
                  <span className="text-xs text-slate-500">{d.kind} · </span>
                  {d.title}
                </p>
                <p className="text-xs text-slate-500">
                  <span className={d.outcome === 'Approved' ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'font-medium text-amber-700 dark:text-amber-400'}>{d.outcome}</span> by {d.by},{' '}
                  {new Date(d.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  {d.comment && ` — "${d.comment}"`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Users size={18} />} title="Your project team" defaultOpen={false}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.team.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2 py-2 text-sm">
              <span className="text-slate-800 dark:text-slate-100">{t.name}</span>
              <span className="text-xs text-slate-500">{roleLabel(t.role)}</span>
              {t.email && <span className="w-full select-all text-xs text-slate-400">{t.email}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <section className={card}>
        <CommentThread projectId={id} entityType="PROJECT" entityId={id} title="Leave Setjeka a note" />
      </section>

      {preview && (
        <DocumentPreviewModal
          filename={preview.name}
          mimeType={preview.mime}
          blobUrl={preview.url}
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
