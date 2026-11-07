'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, FolderKanban, GripVertical } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { OPPORTUNITY_STAGE_LABEL, formatMoney, type OpportunityStage, type Readiness } from '@/lib/stage0';

export interface BoardOpportunity {
  id: string;
  name: string;
  developmentType: string | null;
  location: string | null;
  client: { id: string; name: string } | null;
  owner?: { id: string; fullName: string } | null;
  estimatedValue: number | null;
  currency: string | null;
  stage: OpportunityStage;
  readiness: Readiness;
  convertedProject?: { id: string; name: string; projectCode: string | null } | null;
  decisions?: { status: string }[];
}

// The pipeline left to right, then the two side tracks.
const COLUMNS: OpportunityStage[] = ['IDENTIFIED', 'UNDER_EVALUATION', 'APPROVED', 'CONVERTED', 'ON_HOLD', 'REJECTED'];
// Stages set by moving a card; the other two are reached by their own steps.
const MOVABLE: OpportunityStage[] = ['IDENTIFIED', 'UNDER_EVALUATION', 'ON_HOLD', 'REJECTED'];
const HOW: Partial<Record<OpportunityStage, string>> = {
  APPROVED: 'An opportunity is approved by an Executive’s investment decision: open it and ask for one.',
  CONVERTED: 'An opportunity becomes a project through “Move to Inception” on the opportunity, once Stage 0 is ready.',
};
const ACCENT: Record<OpportunityStage, string> = {
  IDENTIFIED: 'border-t-slate-400',
  UNDER_EVALUATION: 'border-t-blue-500',
  APPROVED: 'border-t-emerald-500',
  CONVERTED: 'border-t-emerald-800',
  ON_HOLD: 'border-t-amber-500',
  REJECTED: 'border-t-red-500',
};

/** Critique L-13: a compact "Move" button with a menu, the path for the
 * keyboard, touch and screen readers, instead of a full-width select on
 * every card. */
function MoveMenu({ o, onMove }: { o: BoardOpportunity; onMove: (stage: OpportunityStage) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Move ${o.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Move to another stage"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <ArrowRightLeft size={14} />
      </button>
      {open && (
        <div role="menu" aria-label={`Move ${o.name} to`} className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Move to</p>
          {MOVABLE.filter((st) => st !== o.stage).map((st) => (
            <button
              key={st}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMove(st);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {OPPORTUNITY_STAGE_LABEL[st]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Totals per currency, e.g. "ZAR 62 000 000 · NGN 7 800 000 000". */
function totals(rows: BoardOpportunity[]) {
  const by = new Map<string, number>();
  for (const o of rows) if (o.estimatedValue != null) by.set(o.currency ?? '', (by.get(o.currency ?? '') ?? 0) + o.estimatedValue);
  return [...by.entries()].map(([c, v]) => formatMoney(v, c)).join(' · ');
}

/** Opportunities as a CRM board (2026-11-05): one column per stage, cards
 * dragged between the stages that are set by hand, or moved with the
 * "Move" menu on each card (keyboard and touch). Approved and Converted keep their own
 * routes: dropping a card there says how to get it there. */
export function OpportunityBoard({ opportunities, onChanged }: { opportunities: BoardOpportunity[]; onChanged: (o: BoardOpportunity[]) => void }) {
  const { authedFetch } = useAuth();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<OpportunityStage | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function move(o: BoardOpportunity, stage: OpportunityStage) {
    setMessage(null);
    if (stage === o.stage) return;
    if (o.stage === 'CONVERTED') return setMessage({ tone: 'info', text: `${o.name} is already a project.` });
    if (!MOVABLE.includes(stage)) return setMessage({ tone: 'info', text: HOW[stage]! });
    const before = opportunities;
    onChanged(opportunities.map((x) => (x.id === o.id ? { ...x, stage } : x)));
    setBusy(o.id);
    try {
      await authedFetch(`/opportunities/${o.id}/stage`, { method: 'PATCH', body: { stage } });
    } catch (e) {
      onChanged(before);
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : 'Could not move the opportunity.' });
    } finally {
      setBusy(null);
    }
  }

  function drop(e: DragEvent, stage: OpportunityStage) {
    e.preventDefault();
    setOver(null);
    const o = opportunities.find((x) => x.id === (dragId ?? e.dataTransfer.getData('text/plain')));
    setDragId(null);
    if (o) move(o, stage);
  }

  return (
    <div className="space-y-3">
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-md px-3 py-2 text-sm ${message.tone === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((stage) => {
          const rows = opportunities.filter((o) => o.stage === stage);
          const value = totals(rows);
          return (
            <section
              key={stage}
              aria-label={OPPORTUNITY_STAGE_LABEL[stage]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={(e) => drop(e, stage)}
              className={`flex w-72 shrink-0 flex-col rounded-xl border border-t-4 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 ${ACCENT[stage]} ${over === stage ? (MOVABLE.includes(stage) ? 'ring-2 ring-emerald-500' : 'ring-2 ring-amber-400') : ''}`}
            >
              <header className="px-3 pb-2 pt-3">
                <h2 className="flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {OPPORTUNITY_STAGE_LABEL[stage]}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">{rows.length}</span>
                </h2>
                <p className="mt-0.5 min-h-4 truncate text-xs text-slate-500 dark:text-slate-400" title={value}>
                  {value}
                </p>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
                {rows.map((o) => {
                  const pending = o.decisions?.some((d) => d.status === 'PENDING');
                  const pct = o.readiness.total ? Math.round((o.readiness.done / o.readiness.total) * 100) : 0;
                  return (
                    <li
                      key={o.id}
                      aria-label={o.name}
                      draggable={o.stage !== 'CONVERTED'}
                      onDragStart={(e) => {
                        setDragId(o.id);
                        e.dataTransfer.setData('text/plain', o.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition dark:border-slate-700 dark:bg-slate-900 ${o.stage !== 'CONVERTED' ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === o.id || busy === o.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-1.5">
                        {o.stage !== 'CONVERTED' && <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-300" aria-hidden />}
                        <Link href={`/opportunities/${o.id}`} className="min-w-0 flex-1 text-sm font-medium text-slate-800 hover:text-emerald-700 hover:underline dark:text-slate-100">
                          {o.name}
                        </Link>
                        {o.stage !== 'CONVERTED' && <MoveMenu o={o} onMove={(st) => move(o, st)} />}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{[o.client?.name ?? 'No client yet', o.location].filter(Boolean).join(' · ')}</p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(o.estimatedValue, o.currency)}</span>
                        {o.owner && <span className="truncate text-slate-400">{o.owner.fullName}</span>}
                      </div>
                      {o.stage === 'CONVERTED' ? (
                        o.convertedProject && (
                          <Link href={`/projects/${o.convertedProject.id}`} className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                            <FolderKanban size={12} /> {o.convertedProject.projectCode ?? 'Project'}: {o.convertedProject.name}
                          </Link>
                        )
                      ) : (
                        <>
                          <div className="mt-2" title={`PROCSA Stage 0: ${o.readiness.done} of ${o.readiness.total}`}>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              Stage 0: {o.readiness.done}/{o.readiness.total}
                              {pending && <span className="ml-1 font-medium text-amber-600">· decision pending</span>}
                            </p>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
                {rows.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700">{MOVABLE.includes(stage) ? 'Drop an opportunity here' : 'None yet'}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
