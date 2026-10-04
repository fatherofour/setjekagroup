'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, CircleAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, primaryButton, type Readiness } from '@/lib/stage0';

interface Props {
  opportunityId: string;
  readiness: Readiness;
  converted: boolean;
  busy: boolean;
  onGoTo: (tab: string) => void;
  onConvert: () => void;
  onChanged: () => void;
}

/** PROCSA Stage 0 — Project Initiation & Briefing, for every role at this
 * stage: the Development Manager's 0.1–0.8, the Executive's decisions (from
 * the register's DEV rows) and the client's confirmation of the vision.
 * Items tick themselves from the evidence on file; staff can sign off the
 * rest by hand (the client's own item only the client can confirm). */
export function Stage0Tracker({ opportunityId, readiness, converted, busy, onGoTo, onConvert, onChanged }: Props) {
  const { authedFetch } = useAuth();
  const [signing, setSigning] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function setCheck(roleKey: string, code: string, done: boolean) {
    setError(null);
    try {
      await authedFetch(`/opportunities/${opportunityId}/checks/${roleKey}/${code}`, done ? { method: 'PUT', body: { note: note.trim() || undefined } } : { method: 'DELETE' });
      setSigning(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update.');
    }
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">PROCSA Stage 0 — Initiation &amp; Briefing</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {converted ? 'Completed and handed over to Inception.' : `${readiness.done} of ${readiness.total} done across all roles.`}
          </p>
        </div>
        {!converted && (
          <button type="button" onClick={onConvert} disabled={busy || !readiness.canConvert} className={primaryButton} title={readiness.blockers.join('\n')}>
            <ArrowRight size={14} />
            Move to Inception
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(readiness.done / readiness.total) * 100}%` }} />
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="mt-4 space-y-4">
        {readiness.roles.map((role) => (
          <div key={role.key}>
            <p className="mb-1 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {role.label}
              <span className="font-normal normal-case tracking-normal text-slate-400">{role.source}</span>
            </p>
            <ul className="space-y-0.5">
              {role.items.map((item) => {
                const Icon = item.done ? CheckCircle2 : item.required ? CircleAlert : Circle;
                const tone = item.done ? 'text-emerald-600 dark:text-emerald-400' : item.required ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600';
                const key = `${role.key}:${item.code}`;
                const canSign = !converted && role.key !== 'CLIENT' && item.source !== 'auto';
                return (
                  <li key={item.code}>
                    <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} />
                      <span className="w-9 shrink-0 font-mono text-[11px] leading-5 text-slate-400">{item.code}</span>
                      <button type="button" onClick={() => onGoTo(item.tab)} className="flex-1 text-left">
                        <span className={`text-sm ${item.done ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{item.text}</span>
                        {item.evidence && <span className="block text-[11px] text-emerald-700 dark:text-emerald-400">✓ {item.evidence}</span>}
                        {item.manualCheck && (
                          <span className="block text-[11px] text-slate-500">
                            Signed off by {item.manualCheck.doneBy}, {new Date(item.manualCheck.doneAt).toLocaleDateString()}
                            {item.manualCheck.note && ` — ${item.manualCheck.note}`}
                          </span>
                        )}
                      </button>
                      {item.required && !item.done && <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Required</span>}
                      {canSign &&
                        (item.source === 'manual' ? (
                          <button type="button" onClick={() => setCheck(role.key, item.code, false)} className="text-[11px] text-slate-400 hover:text-slate-600">
                            Undo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSigning(key);
                              setNote('');
                            }}
                            className="text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            Sign off
                          </button>
                        ))}
                    </div>
                    {signing === key && (
                      <div className="mb-1 ml-[60px] flex flex-wrap gap-2">
                        <input
                          autoFocus
                          aria-label="Sign-off note"
                          className="h-8 min-w-[200px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          placeholder="How was this done? (e.g. no creditors at Stage 0)"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && setCheck(role.key, item.code, true)}
                        />
                        <button type="button" onClick={() => setCheck(role.key, item.code, true)} className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800">
                          Sign off
                        </button>
                        <button type="button" onClick={() => setSigning(null)} className="h-8 rounded-md px-2 text-xs text-slate-500">
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {!converted && readiness.blockers.length > 0 && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          To move to Inception: {readiness.blockers.join(' · ')}
        </p>
      )}
    </div>
  );
}
