'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, CircleDashed, History, Lock, Unlock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, inputClass, primaryButton } from '@/lib/stage0';
import { DELIVERABLE_STATUS_LABEL, DELIVERABLE_STATUS_TONE, type DeliverableStatus } from '@/lib/inception';
import { OUTCOME_LABEL, defaultDueDate, dueLabel, dueTone, todayInput, type ApprovalOutcome } from '@/lib/signoff';
import { DecisionDialog } from '@/components/signoff/DecisionDialog';
import { SignedCopies } from '@/components/signoff/SignedCopies';
import { formatDate } from '@/lib/dates';
import { DateInput } from '@/components/ui/DateInput';

export interface Deliverable {
  key: string;
  title: string;
  procsa: string;
  readyWhen: string;
  ready: boolean;
  status: DeliverableStatus;
  version: number;
  submittedBy: { fullName: string } | null;
  submittedAt: string | null;
  decidedBy: { fullName: string } | null;
  decidedAt: string | null;
  decisionComment: string | null;
  decisionOutcome: ApprovalOutcome | null;
  responseDueAt: string | null;
  id: string | null;
  events: { id: string; type: string; version: number; comment: string | null; createdAt: string; actor: { fullName: string } }[];
}

export const SECTION_FOR_DELIVERABLE: Record<string, string> = {
  BRIEF: 'brief',
  SITE_ASSESSMENT: 'site',
  DESKTOP_VIABILITY: 'viability',
  PROCUREMENT_POLICY: 'policy',
  CONSENTS_SCHEDULE: 'consents',
  PROFESSIONAL_TEAM: 'team',
  INITIATION_PROGRAMME: 'programme',
};

const EVENT_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted to the client',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision requested',
  REOPENED: 'Reopened',
};

/** PROCSA PM 1.9 "Facilitate client approval of all stage 1 documentation".
 * The project can't be requested into Concept until all seven are approved. */
export function SignOffSection({ projectId, stage, onGoTo, onChanged }: { projectId: string; stage: string; onGoTo: (section: string) => void; onChanged?: () => void }) {
  const { authedFetch, user } = useAuth();
  // Setjeka submits, the client decides; consultants follow along read-only.
  const internal = !user || user.accountType === 'INTERNAL' || user.role === 'ADMIN';
  // Only the client decides Stage 1 documents (Meeting 3 hard rule).
  const isClient = !internal && Boolean(user?.clientId);
  const [items, setItems] = useState<Deliverable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<string | null>(null);
  const [dueBy, setDueBy] = useState<Record<string, string>>({});
  const [deciding, setDeciding] = useState<Deliverable | null>(null);
  const [refresh, setRefresh] = useState(0);
  const base = `/projects/${projectId}/inception/deliverables`;

  const load = () =>
    authedFetch<Deliverable[]>(base)
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Stage 1 documents.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedFetch, base]);

  async function act(key: string, path: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      setItems(await authedFetch<Deliverable[]>(`${base}/${key}/${path}`, { method: 'POST', body }));
      setComment((c) => ({ ...c, [key]: '' }));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const approved = items?.filter((d) => d.status === 'APPROVED').length ?? 0;
  const total = items?.length ?? 7;
  const open = approved === total;

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Stage 1 sign-off <span className="font-normal text-slate-400">· PROCSA PM 1.9</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The client approves each Stage 1 document. Editing an approved document reopens it as a new version, so an approval always matches what is on file.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {approved}
              <span className="text-base text-slate-400">/{total}</span>
            </p>
            <p className="text-xs text-slate-500">approved</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(approved / total) * 100}%` }} />
        </div>
        <p
          className={`mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-xs ${
            open ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300'
          }`}
        >
          {open ? <Unlock size={13} /> : <Lock size={13} />}
          {stage !== 'INCEPTION'
            ? 'This project has moved past Inception; the Stage 1 record is kept for reference.'
            : open
              ? 'All Stage 1 documents are approved — the project can now be requested into Concept & Viability (Overview → Stage gate).'
              : 'The gate to Concept & Viability opens once the client has approved all of these.'}
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {items === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => {
            const Icon = d.status === 'APPROVED' ? CheckCircle2 : d.ready ? Circle : CircleDashed;
            const canSubmit = internal && d.ready && (d.status === 'DRAFT' || d.status === 'REVISION_REQUESTED');
            return (
              <li key={d.key} className={cardClass}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon size={17} className={d.status === 'APPROVED' ? 'text-emerald-600' : d.ready ? 'text-slate-400' : 'text-slate-300 dark:text-slate-600'} />
                  <button type="button" onClick={() => onGoTo(SECTION_FOR_DELIVERABLE[d.key])} className="flex items-center gap-1 text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">
                    {d.title}
                    <ChevronRight size={14} className="text-slate-400" />
                  </button>
                  <span className="font-mono text-[11px] text-slate-400">{d.procsa}</span>
                  <span className="ml-auto text-[11px] text-slate-400">v{d.version}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${DELIVERABLE_STATUS_TONE[d.status]}`}>{DELIVERABLE_STATUS_LABEL[d.status]}</span>
                </div>

                {!d.ready && d.status !== 'APPROVED' && <p className="mt-1.5 pl-6 text-xs text-slate-500 dark:text-slate-400">To prepare: {d.readyWhen.toLowerCase()}.</p>}
                {d.status === 'SUBMITTED' && d.submittedBy && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 pl-6 text-xs text-slate-500">
                    Submitted by {d.submittedBy.fullName} on {formatDate(d.submittedAt!)}
                    {(() => {
                      const due = dueLabel(d.responseDueAt);
                      return due && <span className={`rounded-full px-2 py-0.5 font-medium ${dueTone(due)}`}>{due.text}</span>;
                    })()}
                  </p>
                )}
                {d.status === 'REVISION_REQUESTED' && d.decisionComment && (
                  <p className="mt-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {d.decidedBy?.fullName}: {d.decisionOutcome ? OUTCOME_LABEL[d.decisionOutcome].toLowerCase() : 'asked for changes'}
                    {d.decisionComment ? ` - ${d.decisionComment}` : ''}
                  </p>
                )}
                {d.status === 'APPROVED' && d.decidedBy && (
                  <p className="mt-1.5 pl-6 text-xs text-slate-500">
                    {d.decisionOutcome ? OUTCOME_LABEL[d.decisionOutcome] : 'Approved'} by {d.decidedBy.fullName} on {formatDate(d.decidedAt!)}
                    {d.decisionOutcome === 'APPROVED_WITH_COMMENTS' && d.decisionComment ? ` - ${d.decisionComment}` : ''}
                  </p>
                )}
                {d.id && (
                  <div className="mt-1.5 pl-6">
                    <SignedCopies projectId={projectId} subjectId={d.id} refresh={refresh} compact />
                  </div>
                )}

                {(canSubmit || (d.status === 'SUBMITTED' && isClient)) && stage === 'INCEPTION' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                    {canSubmit && (
                      <>
                        <input
                          aria-label={`Note to the client about ${d.title}`}
                          className={`${inputClass} h-8 min-w-[200px] flex-1 text-xs`}
                          placeholder="Note to the client (optional)"
                          value={comment[d.key] ?? ''}
                          onChange={(e) => setComment((c) => ({ ...c, [d.key]: e.target.value }))}
                        />
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                          Respond by
                          <DateInput
                            min={todayInput()}
                            aria-label={`Client to respond to ${d.title} by`}
                            className={`${inputClass} h-8 w-auto text-xs`}
                            value={dueBy[d.key] ?? defaultDueDate()}
                            onChange={(e) => setDueBy((v) => ({ ...v, [d.key]: e.target.value }))}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy === d.key}
                          onClick={() => act(d.key, 'submit', { comment: comment[d.key] || undefined, responseDueAt: (dueBy[d.key] ?? defaultDueDate()) || undefined })}
                          className={primaryButton}
                        >
                          Submit to client
                        </button>
                      </>
                    )}
                    {d.status === 'SUBMITTED' && isClient && (
                      <button type="button" onClick={() => setDeciding(d)} className={primaryButton}>
                        Decide and sign
                      </button>
                    )}
                  </div>
                )}

                {d.events.length > 0 && (
                  <div className="mt-2 pl-6">
                    <button type="button" onClick={() => setHistory(history === d.key ? null : d.key)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
                      <History size={11} />
                      {history === d.key ? 'Hide history' : `History (${d.events.length})`}
                    </button>
                    {history === d.key && (
                      <ul className="mt-1 space-y-0.5">
                        {d.events.map((e) => (
                          <li key={e.id} className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatDate(e.createdAt)} — v{e.version} {EVENT_LABEL[e.type] ?? e.type} by {e.actor.fullName}
                            {e.comment && `: ${e.comment}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {deciding && deciding.id && (
        <DecisionDialog
          projectId={projectId}
          title={`${deciding.title} (v${deciding.version})`}
          context="PROCSA Stage 1 document"
          dueAt={deciding.responseDueAt}
          endpoint={`${base}/${deciding.key}/decide`}
          subjectId={deciding.id}
          onClose={() => setDeciding(null)}
          onDecided={() => {
            load();
            setRefresh((r) => r + 1);
            onChanged?.();
          }}
        >
          <button type="button" onClick={() => onGoTo(SECTION_FOR_DELIVERABLE[deciding.key])} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Read the document before deciding
          </button>
        </DecisionDialog>
      )}
    </div>
  );
}
