'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardCls, fmtDay, inputCls, primaryBtn, secondaryBtn, selectCls } from '@/lib/architect';

interface Row {
  id: string;
  name: string;
  milestone: boolean;
  startDate: string;
  endDate: string;
  percentComplete: number;
  plannedPercent: number;
  behind: boolean;
  late: boolean;
  critical: boolean;
  contractor: string | null;
  heldBy: string[];
  lastUpdate: { date: string; percentComplete: number; note: string | null; recordedBy: { fullName: string } } | null;
  canUpdate: boolean;
}

interface LookAhead {
  today: string;
  weeks: number;
  overdue: Row[];
  byWeek: { start: string; end: string; activities: Row[] }[];
  counts: { inView: number; overdue: number; behind: number; held: number };
}

const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';

function ActivityRow({ projectId, r, onSaved }: { projectId: string; r: Row; onSaved: () => void }) {
  const { authedFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(String(r.percentComplete));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const down = Number(pct) < r.percentComplete;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/look-ahead/activities/${r.id}/progress`, { method: 'POST', body: { percentComplete: Number(pct), note: note || undefined } });
      setOpen(false);
      setNote('');
      onSaved();
    } catch (e) {
      setError(err(e, 'Could not record the progress.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-2" aria-label={r.name}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {r.name}
            {r.critical && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[11px] font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300">critical</span>}
          </p>
          <p className="text-xs text-slate-500">
            {r.milestone ? `Due ${fmtDay(r.endDate)}` : `${fmtDay(r.startDate)} – ${fmtDay(r.endDate)}`}
            {r.contractor && ` · ${r.contractor}`}
            {r.lastUpdate && ` · last updated ${fmtDay(r.lastUpdate.date)} by ${r.lastUpdate.recordedBy.fullName}`}
          </p>
          {r.heldBy.length > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
              <Lock size={12} /> Held by {r.heldBy.join(', ')}: release it before recording progress
            </p>
          )}
        </div>
        <div className="w-36 shrink-0 text-right">
          <p className={`text-sm font-semibold tabular-nums ${r.behind ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {r.percentComplete}% <span className="text-xs font-normal text-slate-400">of {r.plannedPercent}% planned</span>
          </p>
          <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <div className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-600" style={{ width: `${r.plannedPercent}%` }} />
            <div className={`absolute inset-y-0 left-0 ${r.behind ? 'bg-red-500' : 'bg-emerald-600'}`} style={{ width: `${r.percentComplete}%` }} />
          </div>
          {r.canUpdate && !r.heldBy.length && !open && (
            <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Update progress
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/40">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            % complete
            <input type="number" min={0} max={100} aria-label={`% complete: ${r.name}`} className={`${inputCls} mt-0.5 w-24`} value={pct} onChange={(e) => setPct(e.target.value)} />
          </label>
          <label className="min-w-40 flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            {down ? 'Why it is going down' : 'Note (optional)'}
            <input aria-label={`Progress note: ${r.name}`} className={`${inputCls} mt-0.5`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" disabled={busy || pct === '' || (down && !note.trim())} onClick={save} className={primaryBtn}>
            Save
          </button>
          <button type="button" onClick={() => setOpen(false)} className={secondaryBtn}>
            Cancel
          </button>
          {error && <p className={`w-full ${errBox}`}>{error}</p>}
        </div>
      )}
    </li>
  );
}

/** The look-ahead and progress on site (the site manager's items,
 * 2026-11-04). */
export function LookAheadPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [weeks, setWeeks] = useState('3');
  const [data, setData] = useState<LookAhead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<LookAhead>(`/projects/${projectId}/look-ahead?weeks=${weeks}`)
      .then(setData)
      .catch((e) => setError(err(e, 'Failed to load the look-ahead.')));
  }, [authedFetch, projectId, weeks]);
  useEffect(load, [load]);

  if (error) return <p className={errBox}>{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CalendarRange size={16} className="text-emerald-700 dark:text-emerald-400" /> Look-ahead
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              The programme&apos;s next weeks, from today. Record how far each activity has got; it moves the programme, and the history is kept. Anything already past its finish comes first.
            </p>
          </div>
          <Select
            aria-label="Weeks ahead"
            className={`${selectCls} h-9 w-36`}
            value={weeks}
            onChange={setWeeks}
            options={['2', '3', '4', '6'].map((n) => ({ value: n, label: `${n} weeks ahead` }))}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {data.counts.inView} activities · <span className={data.counts.overdue ? 'text-red-700 dark:text-red-400' : ''}>{data.counts.overdue} past their finish</span> · {data.counts.behind} behind plan · {data.counts.held} held at a hold point
        </p>
      </div>

      {data.overdue.length > 0 && (
        <section className={`${cardCls} border-red-200 p-4 dark:border-red-900`} aria-label="Past their finish">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Past their finish ({data.overdue.length})</h3>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {data.overdue.map((r) => (
              <ActivityRow key={r.id} projectId={projectId} r={r} onSaved={load} />
            ))}
          </ul>
        </section>
      )}

      {data.byWeek.map((w, i) => (
        <section key={w.start} className={`${cardCls} p-4`} aria-label={`Week of ${w.start}`}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {i === 0 ? 'This week' : i === 1 ? 'Next week' : `Week of ${fmtDay(w.start)}`} <span className="text-xs font-normal text-slate-500">· {fmtDay(w.start)} – {fmtDay(w.end)}</span>
          </h3>
          {w.activities.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">Nothing on the programme.</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
              {w.activities.map((r) => (
                <ActivityRow key={r.id} projectId={projectId} r={r} onSaved={load} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
