'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from '@/lib/architect';

type PlantState = 'WORKING' | 'STANDING' | 'BROKEN_DOWN';
interface Labour {
  party: string;
  trade?: string;
  count: number;
}
interface Plant {
  description: string;
  count: number;
  state: PlantState;
}
interface Day {
  id?: string;
  exists: boolean;
  date: string;
  status: 'DRAFT' | 'SIGNED';
  workingHours: number;
  weatherNote?: string | null;
  labour: Labour[];
  plant: Plant[];
  visitors?: string | null;
  deliveries?: string | null;
  delays?: string | null;
  instructions?: string | null;
  safety?: string | null;
  notes?: string | null;
  carriedFrom?: string | null;
  plantFromRegister?: boolean;
  headcount: number;
  weather: { tempMaxC: number | null; tempMinC: number | null; precipitationMm: number | null; windMaxKmh: number | null } | null;
  progress?: { percentComplete: number; previousPercent: number; note: string | null; activity: { name: string }; recordedBy: { fullName: string } }[];
  author?: { fullName: string };
  signedBy?: { fullName: string } | null;
  signedAt?: string | null;
  can: { edit: boolean; sign: boolean };
}
interface Listing {
  today: string;
  canWrite: boolean;
  days: { id: string; date: string; status: 'DRAFT' | 'SIGNED'; headcount: number; manHours: number; hasDelays: boolean; author: string }[];
}

const STATE: Record<PlantState, string> = { WORKING: 'Working', STANDING: 'Standing', BROKEN_DOWN: 'Broken down' };
const TEXTS: { key: 'delays' | 'instructions' | 'deliveries' | 'visitors' | 'safety' | 'notes'; label: string; hint: string }[] = [
  { key: 'delays', label: 'Delays and what held the work up', hint: 'Weather, late information, access, the client, breakdowns — with times' },
  { key: 'instructions', label: 'Instructions received', hint: 'Who gave them and what they were' },
  { key: 'deliveries', label: 'Deliveries', hint: 'What arrived, from whom' },
  { key: 'visitors', label: 'Visitors', hint: 'Who came on site, and why' },
  { key: 'safety', label: 'Safety', hint: 'Toolbox talks, observations, incidents (report incidents on Health & safety)' },
  { key: 'notes', label: 'Work done and other notes', hint: '' },
];
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const shift = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** The daily site diary (the site manager's items, 2026-11-04). */
export function SiteDiaryPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [list, setList] = useState<Listing | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [form, setForm] = useState<Day | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/site-diary`;

  const loadList = useCallback(() => {
    authedFetch<Listing>(base)
      .then((l) => {
        setList(l);
        setDate((d) => d ?? l.today);
      })
      .catch((e) => setError(err(e, 'Failed to load the diary.')));
  }, [authedFetch, base]);
  useEffect(loadList, [loadList]);

  useEffect(() => {
    if (!date) return;
    authedFetch<Day>(`${base}/${date}`)
      .then((d) => {
        setDay(d);
        setForm(d);
        setSaved(false);
      })
      .catch((e) => setError(err(e, 'Failed to load the day.')));
  }, [authedFetch, base, date]);

  async function save() {
    if (!form || !date) return;
    setError(null);
    setBusy(true);
    try {
      const d = await authedFetch<Day>(`${base}/${date}`, {
        method: 'PUT',
        body: { workingHours: Number(form.workingHours) || 0, weatherNote: form.weatherNote ?? null, labour: form.labour, plant: form.plant, visitors: form.visitors ?? null, deliveries: form.deliveries ?? null, delays: form.delays ?? null, instructions: form.instructions ?? null, safety: form.safety ?? null, notes: form.notes ?? null },
      });
      setDay(d);
      setForm(d);
      setSaved(true);
      loadList();
    } catch (e) {
      setError(err(e, 'Could not save the day.'));
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    if (!date || !confirm(`Sign the diary for ${fmtDay(date)}? It can't be changed afterwards.`)) return;
    setBusy(true);
    try {
      const d = await authedFetch<Day>(`${base}/${date}/sign`, { method: 'POST' });
      setDay(d);
      setForm(d);
      loadList();
    } catch (e) {
      setError(err(e, 'Could not sign the day.'));
    } finally {
      setBusy(false);
    }
  }

  if (!list || !date) return <p className={error ? errBox : 'text-sm text-slate-400'}>{error ?? 'Loading…'}</p>;
  const edit = Boolean(form?.can.edit);
  const set = (patch: Partial<Day>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const total = (form?.labour ?? []).reduce((n, l) => n + (Number(l.count) || 0), 0);

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <BookOpenText size={16} className="text-emerald-700 dark:text-emerald-400" /> Site diary
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setDate(shift(date, -1))} className={secondaryBtn} aria-label="Previous day">
              <ChevronLeft size={16} />
            </button>
            <input type="date" aria-label="Day" max={list.today} className={`${inputCls} w-40`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button type="button" disabled={date >= list.today} onClick={() => setDate(shift(date, 1))} className={secondaryBtn} aria-label="Next day">
              <ChevronRight size={16} />
            </button>
            {date !== list.today && (
              <button type="button" onClick={() => setDate(list.today)} className={secondaryBtn}>
                Today
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">One page a day: who was on site, the plant, the weather, and anything that held the work up. Signed days are locked, and back up delay claims and the safety record.</p>
      </div>

      {form && (
        <div className={`${cardCls} space-y-4 p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{fmtDay(date)}</p>
              <p className="text-xs text-slate-500">
                {form.exists ? `Written by ${form.author?.fullName}` : form.plantFromRegister ? `New page: ${form.carriedFrom ? `labour carried from ${fmtDay(form.carriedFrom)}, ` : ''}plant from the register` : form.carriedFrom ? `New page: labour and plant carried from ${fmtDay(form.carriedFrom)}` : 'New page'}
                {form.signedBy && ` · signed by ${form.signedBy.fullName}, ${fmtDayTime(form.signedAt)}`}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${form.status === 'SIGNED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : form.exists ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
              {form.status === 'SIGNED' ? 'Signed' : form.exists ? 'Draft' : 'Not written'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2 dark:bg-slate-800/40">
              <p className="text-xs font-medium text-slate-500">Weather recorded on site</p>
              <p className="text-slate-800 dark:text-slate-100">
                {form.weather ? `${form.weather.tempMinC ?? '—'}–${form.weather.tempMaxC ?? '—'} °C · rain ${form.weather.precipitationMm ?? 0} mm · wind up to ${form.weather.windMaxKmh ?? '—'} km/h` : 'Not recorded for this day'}
              </p>
              {edit ? (
                <input aria-label="Weather on site" className={`${inputCls} mt-2`} value={form.weatherNote ?? ''} onChange={(e) => set({ weatherNote: e.target.value })} placeholder="What it was like on site, e.g. storm from 14:00" />
              ) : (
                form.weatherNote && <p className="mt-1 text-slate-700 dark:text-slate-200">{form.weatherNote}</p>
              )}
            </div>
            <label className={labelCls}>
              Working hours
              <input type="number" min={0} max={24} step={0.5} disabled={!edit} className={`${inputCls} mt-0.5`} value={form.workingHours} onChange={(e) => set({ workingHours: Number(e.target.value) })} />
            </label>
          </div>

          <section aria-label="Labour on site">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Labour on site ({total})</h3>
              {edit && (
                <button type="button" onClick={() => set({ labour: [...form.labour, { party: '', trade: '', count: 0 }] })} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  <Plus size={13} /> Add a line
                </button>
              )}
            </div>
            {form.labour.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">Nobody recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {form.labour.map((l, i) => (
                  <li key={i} className="grid grid-cols-[1fr_1fr_4.5rem_auto] items-center gap-2">
                    <input aria-label={`Firm ${i + 1}`} disabled={!edit} className={inputCls} value={l.party} placeholder="Firm" onChange={(e) => set({ labour: form.labour.map((x, k) => (k === i ? { ...x, party: e.target.value } : x)) })} />
                    <input aria-label={`Trade ${i + 1}`} disabled={!edit} className={inputCls} value={l.trade ?? ''} placeholder="Trade" onChange={(e) => set({ labour: form.labour.map((x, k) => (k === i ? { ...x, trade: e.target.value } : x)) })} />
                    <input aria-label={`People ${i + 1}`} type="number" min={0} disabled={!edit} className={inputCls} value={l.count} onChange={(e) => set({ labour: form.labour.map((x, k) => (k === i ? { ...x, count: Number(e.target.value) } : x)) })} />
                    {edit ? (
                      <button type="button" onClick={() => set({ labour: form.labour.filter((_, k) => k !== i) })} className="rounded p-1.5 text-slate-400 hover:text-red-600" aria-label={`Remove labour line ${i + 1}`}>
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Plant on site">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plant on site</h3>
              {edit && (
                <button type="button" onClick={() => set({ plant: [...form.plant, { description: '', count: 1, state: 'WORKING' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  <Plus size={13} /> Add plant
                </button>
              )}
            </div>
            {form.plant.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">No plant recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {form.plant.map((p, i) => (
                  <li key={i} className="grid grid-cols-[1fr_4rem_8.5rem_auto] items-center gap-2">
                    <input aria-label={`Plant ${i + 1}`} disabled={!edit} className={inputCls} value={p.description} placeholder="e.g. 20 t excavator" onChange={(e) => set({ plant: form.plant.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)) })} />
                    <input aria-label={`How many ${i + 1}`} type="number" min={0} disabled={!edit} className={inputCls} value={p.count} onChange={(e) => set({ plant: form.plant.map((x, k) => (k === i ? { ...x, count: Number(e.target.value) } : x)) })} />
                    <Select aria-label={`State ${i + 1}`} disabled={!edit} className={`${selectCls} w-full`} value={p.state} onChange={(v) => set({ plant: form.plant.map((x, k) => (k === i ? { ...x, state: v as PlantState } : x)) })} options={(Object.keys(STATE) as PlantState[]).map((s) => ({ value: s, label: STATE[s] }))} />
                    {edit ? (
                      <button type="button" onClick={() => set({ plant: form.plant.filter((_, k) => k !== i) })} className="rounded p-1.5 text-slate-400 hover:text-red-600" aria-label={`Remove plant line ${i + 1}`}>
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(form.progress ?? []).length > 0 && (
            <section aria-label="Progress recorded">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress recorded this day</h3>
              <ul className="mt-1 space-y-0.5 text-sm text-slate-700 dark:text-slate-200">
                {(form.progress ?? []).map((p, i) => (
                  <li key={i}>
                    {p.activity.name}: {p.previousPercent}% → {p.percentComplete}%<span className="text-xs text-slate-500"> · {p.recordedBy.fullName}</span>
                    {p.note && <span className="text-xs text-slate-500"> — {p.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEXTS.map((t) =>
              edit ? (
                <label key={t.key} className={`${labelCls} ${t.key === 'delays' || t.key === 'notes' ? 'sm:col-span-2' : ''}`}>
                  {t.label}
                  <textarea className={`${textareaCls} mt-0.5`} rows={t.key === 'delays' || t.key === 'notes' ? 3 : 2} value={form[t.key] ?? ''} placeholder={t.hint} onChange={(e) => set({ [t.key]: e.target.value } as Partial<Day>)} />
                </label>
              ) : (
                form[t.key] && (
                  <div key={t.key} className={t.key === 'delays' || t.key === 'notes' ? 'sm:col-span-2' : ''}>
                    <p className="text-xs font-medium text-slate-500">{t.label}</p>
                    <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-100">{form[t.key]}</p>
                  </div>
                )
              ),
            )}
          </div>

          {(edit || form.can.sign) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {edit && (
                <button type="button" disabled={busy} onClick={save} className={primaryBtn}>
                  {form.exists ? 'Save the day' : 'Start the day'}
                </button>
              )}
              {form.can.sign && (
                <button type="button" disabled={busy || JSON.stringify(form) !== JSON.stringify(day)} onClick={sign} className={secondaryBtn} title={JSON.stringify(form) !== JSON.stringify(day) ? 'Save first' : undefined}>
                  Sign the day
                </button>
              )}
              {saved && <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved</span>}
            </div>
          )}
          {!edit && !form.exists && <p className="text-xs text-slate-400">Nothing was written for this day.</p>}
          {form.exists && form.id && <CommentThread projectId={projectId} entityType="SITE_DIARY" entityId={form.id} />}
        </div>
      )}

      <div className={`${cardCls} p-4`}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent days</h3>
        {list.days.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No days written yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {list.days.slice(0, 31).map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setDate(d.date.slice(0, 10))} className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-sm hover:text-emerald-700">
                  <span className="w-28 shrink-0 text-slate-800 dark:text-slate-100">{fmtDay(d.date)}</span>
                  <span className="min-w-0 flex-1 text-xs text-slate-500">
                    {d.headcount} on site · {d.author}
                    {d.hasDelays && <span className="text-amber-700 dark:text-amber-400"> · delays noted</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${d.status === 'SIGNED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>{d.status === 'SIGNED' ? 'Signed' : 'Draft'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
