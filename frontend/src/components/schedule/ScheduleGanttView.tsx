'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { formatDate } from '@/lib/dates';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns3, CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { useScheduleData } from './useScheduleData';
import { assigneeLabel, buildActivityTree, type ScheduleActivity } from './scheduleTypes';

// An MS Project / Smartsheet style Gantt (2026-11-04: Setjeka runs projects
// and wanted the programme to look and work like the tools it knows): a
// task table on the left, the timeline on the right, both scrolling
// together; summary rows that fold; zoom from days to quarters; the
// critical path, a baseline and today's line; and bars dragged to move or
// stretched to change their duration.

type Zoom = 'day' | 'week' | 'month' | 'quarter';
type Column = 'duration' | 'start' | 'finish' | 'predecessors' | 'percent' | 'resource';

const DAY = 86_400_000;
const ROW = 32;
const HEADER = 52;
const PX_PER_DAY: Record<Zoom, number> = { day: 30, week: 14, month: 4.5, quarter: 1.6 };
const ZOOMS: { value: Zoom; label: string }[] = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
  { value: 'quarter', label: 'Quarters' },
];
const COLUMNS: { key: Column; label: string; width: number }[] = [
  { key: 'duration', label: 'Duration', width: 72 },
  { key: 'start', label: 'Start', width: 96 },
  { key: 'finish', label: 'Finish', width: 96 },
  { key: 'predecessors', label: 'Predecessors', width: 104 },
  { key: 'percent', label: '% Complete', width: 96 },
  { key: 'resource', label: 'Resource', width: 132 },
];
const ID_WIDTH = 40;
const COLUMNS_KEY = 'setjeka_gantt_columns';

const COLOURS = {
  task: '#5B8DEF',
  taskProgress: '#2457C5',
  critical: '#F08A80',
  criticalProgress: '#C9372C',
  summary: '#1E293B',
  milestone: '#1E293B',
  baseline: '#A3ADBA',
  today: '#E8590C',
  link: '#64748B',
};

const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const parse = (s: string) => dayStart(new Date(s));
const isWeekend = (t: number) => {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6;
};
const fmt = (t: number, opts: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString('en-ZA', { timeZone: 'UTC', ...opts });
// The grid's Start and Finish columns, in the person's date format (M-07).
const fmtCell = (t: number) => formatDate(new Date(t).toISOString().slice(0, 10));
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Working days from a to b, both included (the schedule counts Monday to Friday). */
function workingDaysInclusive(a: number, b: number) {
  let n = 0;
  for (let t = a; t <= b; t += DAY) if (!isWeekend(t)) n++;
  return n;
}
const nextWorkingDay = (t: number) => {
  let x = t;
  while (isWeekend(x)) x += DAY;
  return x;
};

/** The units across the timeline at one scale: their start and label. */
function units(from: number, to: number, unit: 'day' | 'week' | 'month' | 'quarter' | 'year') {
  const out: { t: number; label: string }[] = [];
  const d = new Date(from);
  if (unit === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (unit === 'month' || unit === 'quarter' || unit === 'year') d.setUTCDate(1);
  if (unit === 'quarter') d.setUTCMonth(d.getUTCMonth() - (d.getUTCMonth() % 3));
  if (unit === 'year') d.setUTCMonth(0);
  while (d.getTime() <= to) {
    const t = d.getTime();
    const label =
      unit === 'day'
        ? `${fmt(t, { weekday: 'narrow' })} ${d.getUTCDate()}`
        : unit === 'week'
          ? fmt(t, { day: 'numeric', month: 'short' })
          : unit === 'month'
            ? fmt(t, { month: 'short' })
            : unit === 'quarter'
              ? `Q${Math.floor(d.getUTCMonth() / 3) + 1}`
              : String(d.getUTCFullYear());
    out.push({ t, label });
    if (unit === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (unit === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (unit === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return out;
}
const TIERS: Record<Zoom, ['month' | 'year', 'day' | 'week' | 'month' | 'quarter']> = {
  day: ['month', 'day'],
  week: ['month', 'week'],
  month: ['year', 'month'],
  quarter: ['year', 'quarter'],
};

interface Drag {
  id: string;
  kind: 'move' | 'resize';
  x0: number;
  days: number;
}

export function ScheduleGanttView({ data, projectId, onSelect }: { data: ReturnType<typeof useScheduleData>; projectId: string; onSelect: (activityId: string) => void }) {
  const { authedFetch } = useAuth();
  const { activities, dependencies } = data;
  const [zoom, setZoom] = useState<Zoom>('week');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showCritical, setShowCritical] = useState(true);
  const [baselines, setBaselines] = useState<{ id: string; name: string }[]>([]);
  const [baselineId, setBaselineId] = useState('');
  const [baseline, setBaseline] = useState<Map<string, { start: number; end: number }>>(new Map());
  const [nameWidth, setNameWidth] = useState(240);
  const [columns, setColumns] = useState<Column[]>(['duration', 'start', 'finish', 'predecessors', 'percent']);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; col: Column; value: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a per-viewer preference read once from storage
      if (saved) setColumns(JSON.parse(saved));
    } catch {
      // storage unavailable: the default columns stay
    }
  }, []);

  useEffect(() => {
    authedFetch<{ id: string; name: string }[]>(`/projects/${projectId}/schedule/baselines`)
      .then(setBaselines)
      .catch(() => setBaselines([]));
  }, [authedFetch, projectId]);

  useEffect(() => {
    if (!baselineId) return;
    authedFetch<{ activities: { id: string; baseline: { start: string; end: string } | null }[] }>(`/projects/${projectId}/schedule/baselines/variance?baselineId=${baselineId}`)
      .then((v) => setBaseline(new Map(v.activities.flatMap((a) => (a.baseline ? [[a.id, { start: parse(a.baseline.start), end: parse(a.baseline.end) }] as const] : [])))))
      .catch(() => setBaseline(new Map()));
  }, [authedFetch, projectId, baselineId]);

  const tree = useMemo(() => buildActivityTree(activities ?? []), [activities]);

  // Summary rows span their children, as MS Project rolls them up.
  const span = useMemo(() => {
    const byId = new Map(tree.map((r) => [r.activity.id, r]));
    const out = new Map<string, { start: number; end: number; percent: number }>();
    const visit = (id: string): { start: number; end: number; work: number; done: number } => {
      const row = byId.get(id)!;
      const a = row.activity;
      const kids = tree.filter((r) => r.activity.parentId === id);
      if (!kids.length) {
        const start = parse(a.startDate);
        const end = parse(a.endDate);
        const work = Math.max(a.durationDays, 1);
        out.set(id, { start, end, percent: a.percentComplete });
        return { start, end, work, done: (work * a.percentComplete) / 100 };
      }
      const parts = kids.map((k) => visit(k.activity.id));
      const start = Math.min(...parts.map((p) => p.start));
      const end = Math.max(...parts.map((p) => p.end));
      const work = parts.reduce((s, p) => s + p.work, 0);
      const done = parts.reduce((s, p) => s + p.done, 0);
      out.set(id, { start, end, percent: work ? Math.round((done / work) * 100) : 0 });
      return { start, end, work, done };
    };
    for (const r of tree) if (r.depth === 0) visit(r.activity.id);
    return out;
  }, [tree]);

  const rows = useMemo(() => {
    const hidden = new Set<string>();
    return tree.filter((r) => {
      const parent = r.activity.parentId;
      if (parent && (hidden.has(parent) || collapsed.has(parent))) {
        hidden.add(r.activity.id);
        return false;
      }
      return true;
    });
  }, [tree, collapsed]);
  const number = useMemo(() => new Map(tree.map((r, i) => [r.activity.id, i + 1])), [tree]);

  const px = PX_PER_DAY[zoom];
  const today = dayStart(new Date());
  const { from, to } = useMemo(() => {
    const ts = [...span.values()].flatMap((s) => [s.start, s.end]);
    for (const b of baseline.values()) ts.push(b.start, b.end);
    const lo = ts.length ? Math.min(...ts) : today;
    const hi = ts.length ? Math.max(...ts) : today + 30 * DAY;
    const pad = zoom === 'day' ? 7 : zoom === 'week' ? 14 : zoom === 'month' ? 45 : 120;
    return { from: Math.min(lo, today) - pad * DAY, to: Math.max(hi, today) + pad * DAY };
  }, [span, baseline, zoom, today]);
  const x = (t: number) => ((t - from) / DAY) * px;
  const width = x(to) + px;

  const visibleColumns = COLUMNS.filter((c) => columns.includes(c.key));
  const tableWidth = ID_WIDTH + nameWidth + visibleColumns.reduce((s, c) => s + c.width, 0);

  // Open at today, with a little of the past in view (critique M-14);
  // before the work starts, at its start.
  const firstStart = tree.length ? Math.min(...tree.map((r) => span.get(r.activity.id)?.start ?? today)) : today;
  const openAt = Math.max(firstStart, today);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(openAt) - Math.min(el.clientWidth * 0.25, 4 * 7 * px));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, activities === null]);

  if (activities === null) return <p className="text-sm text-slate-400">Loading…</p>;

  const [topUnit, bottomUnit] = TIERS[zoom];
  const top = units(from, to, topUnit);
  const bottom = units(from, to, bottomUnit);
  const rowIndex = new Map(rows.map((r, i) => [r.activity.id, i]));
  const hasChildren = new Set(tree.filter((r) => r.hasChildren).map((r) => r.activity.id));
  const predecessorsOf = new Map<string, string>();
  for (const d of dependencies ?? []) {
    const n = number.get(d.predecessorId);
    if (!n) continue;
    const label = `${n}${d.type === 'FS' && !d.lagDays ? '' : d.type}${d.lagDays ? `${d.lagDays > 0 ? '+' : ''}${d.lagDays}d` : ''}`;
    predecessorsOf.set(d.successorId, [predecessorsOf.get(d.successorId), label].filter(Boolean).join(', '));
  }
  const critical = (a: ScheduleActivity) => showCritical && a.isCriticalPath;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function chooseColumns(next: Column[]) {
    setColumns(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  async function save(id: string, input: Parameters<typeof data.updateActivity>[1]) {
    try {
      data.setError(null);
      await data.updateActivity(id, input);
    } catch (e) {
      data.setError(e instanceof ApiError ? e.message : 'Could not update the activity.');
    }
  }
  async function commitEdit() {
    if (!editing) return;
    const { id, col, value } = editing;
    setEditing(null);
    const a = activities!.find((x) => x.id === id);
    if (!a) return;
    if (col === 'duration') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n >= 1 && n !== a.durationDays) await save(id, { durationDays: n });
    } else if (col === 'start') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value !== a.startDate.slice(0, 10)) await save(id, { startDate: value });
    } else if (col === 'percent') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 100 && n !== a.percentComplete) await save(id, { percentComplete: n, status: n >= 100 ? 'COMPLETED' : n > 0 ? 'IN_PROGRESS' : 'NOT_STARTED' });
    }
  }

  // ---- Dragging a bar: move it (no predecessors) or stretch its end ----
  function startDrag(e: ReactPointerEvent, a: ScheduleActivity, kind: Drag['kind']) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(a.id);
    setDrag({ id: a.id, kind, x0: e.clientX, days: 0 });
  }
  function moveDrag(e: ReactPointerEvent) {
    if (!drag) return;
    const days = Math.round((e.clientX - drag.x0) / px);
    if (days !== drag.days) setDrag({ ...drag, days });
  }
  async function endDrag() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.days) return;
    const a = activities!.find((x) => x.id === d.id)!;
    const start = parse(a.startDate);
    const end = parse(a.endDate);
    if (d.kind === 'move') await save(a.id, { startDate: isoDay(nextWorkingDay(start + d.days * DAY)) });
    else await save(a.id, { durationDays: Math.max(1, workingDaysInclusive(start, Math.max(start, end + d.days * DAY))) });
  }

  const cell = 'flex shrink-0 items-center border-r border-slate-200/70 px-2 dark:border-slate-800';
  const head = `${cell} whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400`;

  // Dependency lines, MS Project style: out of the end, down, into the start.
  const links = (dependencies ?? []).flatMap((d) => {
    const pi = rowIndex.get(d.predecessorId);
    const si = rowIndex.get(d.successorId);
    if (pi === undefined || si === undefined) return [];
    const p = span.get(d.predecessorId);
    const s = span.get(d.successorId);
    const pa = activities.find((a) => a.id === d.predecessorId);
    const sa = activities.find((a) => a.id === d.successorId);
    if (!p || !s || !pa || !sa) return [];
    const fromEnd = d.type === 'FS' || d.type === 'FF';
    const toStart = d.type === 'FS' || d.type === 'SS';
    const x1 = fromEnd ? x(p.end) + px : x(p.start);
    const x2 = toStart ? x(s.start) : x(s.end) + px;
    const y1 = pi * ROW + ROW / 2;
    const y2 = si * ROW + ROW / 2;
    const out = fromEnd ? 8 : -8;
    const path =
      toStart && x2 >= x1 + 16
        ? `M ${x1} ${y1} H ${x1 + out} V ${y2} H ${x2 - 2}`
        : `M ${x1} ${y1} H ${x1 + out} V ${y1 + (y2 > y1 ? ROW / 2 : -ROW / 2)} H ${toStart ? x2 - 10 : x2 + 10} V ${y2} H ${toStart ? x2 - 2 : x2 + 2}`;
    const red = critical(pa) && critical(sa);
    return [<path key={d.id} d={path} fill="none" stroke={red ? COLOURS.criticalProgress : COLOURS.link} strokeWidth={1.25} markerEnd={red ? 'url(#gantt-arrow-red)' : 'url(#gantt-arrow)'} />];
  });

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Zoom" className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          {ZOOMS.map((z) => (
            <button
              key={z.value}
              type="button"
              aria-pressed={zoom === z.value}
              onClick={() => setZoom(z.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${zoom === z.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
            >
              {z.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scroller.current?.scrollTo({ left: Math.max(0, x(today) - 200), behavior: 'smooth' })}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <CalendarDays size={13} /> Today
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ChevronsUpDown size={13} /> Expand all
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(new Set(hasChildren))}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ChevronsDownUp size={13} /> Collapse all
        </button>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} className="h-4 w-4 accent-red-600" />
          Critical path
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          Baseline
          <select
            aria-label="Baseline"
            value={baselineId}
            onChange={(e) => {
              setBaselineId(e.target.value);
              if (!e.target.value) setBaseline(new Map());
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">None</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative ml-auto">
          <button
            type="button"
            aria-expanded={columnsOpen}
            onClick={() => setColumnsOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Columns3 size={13} /> Columns
          </button>
          {columnsOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={columns.includes(c.key)}
                    onChange={(e) => chooseColumns(e.target.checked ? COLUMNS.map((k) => k.key).filter((k) => k === c.key || columns.includes(k)) : columns.filter((k) => k !== c.key))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={scroller}
        className="relative overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        style={{ maxHeight: 'calc(100vh - 250px)', minHeight: 360 }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <div style={{ width: tableWidth + width, minHeight: HEADER + rows.length * ROW }} className="relative">
          {/* Header row */}
          <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900" style={{ height: HEADER }}>
            <div className="sticky left-0 z-40 flex border-r-2 border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900" style={{ width: tableWidth }}>
              <div className={`${head} justify-center`} style={{ width: ID_WIDTH }}>
                #
              </div>
              <div className={`${head} relative`} style={{ width: nameWidth }}>
                Task name
                <span
                  role="separator"
                  aria-label="Resize the task name column"
                  aria-orientation="vertical"
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-emerald-400/60"
                  onPointerDown={(e) => {
                    const x0 = e.clientX;
                    const w0 = nameWidth;
                    const onMove = (ev: PointerEvent) => setNameWidth(Math.min(560, Math.max(160, w0 + ev.clientX - x0)));
                    const onUp = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                />
              </div>
              {visibleColumns.map((c) => (
                <div key={c.key} className={head} style={{ width: c.width }}>
                  {c.label}
                </div>
              ))}
            </div>
            <div className="relative" style={{ width }}>
              {top.map((u, i) => (
                <div
                  key={`t${u.t}`}
                  className="absolute top-0 flex h-6 items-center truncate border-b border-l border-slate-200 px-2 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  style={{ left: Math.max(0, x(u.t)), width: x(top[i + 1]?.t ?? to + DAY) - Math.max(0, x(u.t)) }}
                >
                  {topUnit === 'month' ? fmt(u.t, { month: 'long', year: 'numeric' }) : u.label}
                </div>
              ))}
              {bottom.map((u, i) => (
                <div
                  key={`b${u.t}`}
                  className={`absolute bottom-0 flex h-[26px] items-center justify-center truncate border-l border-slate-200 text-[10px] font-medium dark:border-slate-700 ${
                    zoom === 'day' && isWeekend(u.t) ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                  style={{ left: Math.max(0, x(u.t)), width: x(bottom[i + 1]?.t ?? to + DAY) - Math.max(0, x(u.t)) }}
                >
                  {u.label}
                </div>
              ))}
              {today >= from && today <= to && (
                <div className="absolute bottom-0 z-10 -translate-x-1/2 rounded-t px-1 text-[9px] font-bold uppercase text-white" style={{ left: x(today) + px / 2, background: COLOURS.today }}>
                  Today
                </div>
              )}
            </div>
          </div>

          {/* Timeline background: weekends, unit lines and today */}
          <svg className="pointer-events-none absolute" style={{ left: tableWidth, top: HEADER }} width={width} height={rows.length * ROW} aria-hidden>
            {(zoom === 'day' || zoom === 'week') &&
              units(from, to, 'day')
                .filter((u) => isWeekend(u.t))
                .map((u) => <rect key={u.t} x={x(u.t)} y={0} width={px} height={rows.length * ROW} className="fill-slate-100 dark:fill-slate-800/50" />)}
            {bottom.map((u) => (
              <line key={u.t} x1={x(u.t)} x2={x(u.t)} y1={0} y2={rows.length * ROW} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
            ))}
            <line x1={x(today) + px / 2} x2={x(today) + px / 2} y1={0} y2={rows.length * ROW} stroke={COLOURS.today} strokeWidth={1.5} strokeDasharray="4 3" />
          </svg>

          {/* Rows */}
          <div role="rowgroup">
            {rows.map((r, i) => {
              const a = r.activity;
              const isSummary = hasChildren.has(a.id);
              const s = span.get(a.id)!;
              const isMilestone = a.activityType === 'MILESTONE' && !isSummary;
              const sel = selected === a.id;
              const bg = sel ? 'bg-blue-50 dark:bg-blue-950/40' : i % 2 ? 'bg-slate-50/60 dark:bg-slate-800/20' : 'bg-white dark:bg-slate-900';
              // The frozen task columns need a solid fill: the see-through row
              // tints let bars and weekend shading show through them when the
              // timeline scrolls underneath (the user's screenshot, 14 Nov).
              // Same colours as the row tints, made opaque.
              const stickyBg = sel ? 'bg-blue-50 dark:bg-[#121d3b]' : i % 2 ? 'bg-[#f9fafc] dark:bg-[#131c2f]' : 'bg-white dark:bg-slate-900';
              const dragging = drag?.id === a.id ? drag : null;
              const shiftDays = dragging?.kind === 'move' ? dragging.days : 0;
              const stretchDays = dragging?.kind === 'resize' ? dragging.days : 0;
              const bx = x(s.start) + shiftDays * px;
              const bw = Math.max(px, x(s.end) + px - x(s.start) + stretchDays * px);
              const base = baseline.get(a.id);
              const crit = critical(a) && !isSummary;
              const movable = data.canEdit && !isSummary && !isMilestone && !a.asSuccessorOf?.length;
              const editable = data.canEdit && !isSummary;
              const tip = `${a.name}\n${fmtCell(s.start)} – ${fmtCell(s.end)} · ${isSummary ? '' : `${a.durationDays}d · `}${s.percent}% complete${a.totalFloatDays != null && !isSummary ? ` · float ${a.totalFloatDays}d` : ''}${a.asSuccessorOf?.length ? '\nStart set by its predecessors' : ''}`;
              const value = (col: Column) => {
                switch (col) {
                  case 'duration':
                    return isSummary ? `${workingDaysInclusive(s.start, s.end)}d` : `${a.durationDays}d`;
                  case 'start':
                    return fmtCell(s.start);
                  case 'finish':
                    return fmtCell(s.end);
                  case 'predecessors':
                    return predecessorsOf.get(a.id) ?? '';
                  case 'percent':
                    return `${s.percent}%`;
                  case 'resource':
                    return assigneeLabel(a) ?? '';
                }
              };
              const canEdit = (col: Column) => editable && (col === 'percent' || col === 'start' || (col === 'duration' && !isMilestone));
              return (
                <div key={a.id} role="row" aria-label={a.name} aria-selected={sel} className={`flex ${bg}`} style={{ height: ROW }} onClick={() => setSelected(a.id)}>
                  <div className={`sticky left-0 z-20 flex border-r-2 border-slate-300 dark:border-slate-700 ${stickyBg}`} style={{ width: tableWidth }}>
                    <div className={`${cell} justify-center text-[11px] text-slate-400`} style={{ width: ID_WIDTH }}>
                      {number.get(a.id)}
                    </div>
                    <div className={`${cell} gap-1`} style={{ width: nameWidth, paddingLeft: 6 + r.depth * 16 }}>
                      {isSummary ? (
                        <button
                          type="button"
                          aria-label={collapsed.has(a.id) ? `Expand ${a.name}` : `Collapse ${a.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(a.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          {collapsed.has(a.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : (
                        <span className="w-[18px] shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => onSelect(a.id)}
                        title={`Open ${a.name}`}
                        className={`truncate text-left text-[13px] hover:text-emerald-700 hover:underline dark:hover:text-emerald-400 ${isSummary ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200'} ${crit ? 'text-red-700 dark:text-red-400' : ''}`}
                      >
                        {a.name}
                        {a.link && (
                          <span title={a.link === 'WAITING_ON' ? "Another firm's work your activity waits on" : "Another firm's work that waits on yours"} className={`ml-1.5 rounded px-1 text-[10px] font-normal ${a.link === 'WAITING_ON' ? 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' : 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300'}`}>
                            {a.link === 'WAITING_ON' ? "you're waiting on this" : 'waiting on your work'}
                          </span>
                        )}
                      </button>
                    </div>
                    {visibleColumns.map((c) =>
                      editing?.id === a.id && editing.col === c.key ? (
                        <div key={c.key} className={`${cell} px-1`} style={{ width: c.width }}>
                          <input
                            autoFocus
                            aria-label={`${c.label}: ${a.name}`}
                            type={c.key === 'start' ? 'date' : 'number'}
                            min={c.key === 'percent' ? 0 : 1}
                            max={c.key === 'percent' ? 100 : undefined}
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit();
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            className="w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-xs outline-none dark:bg-slate-950"
                          />
                        </div>
                      ) : (
                        <button
                          key={c.key}
                          type="button"
                          disabled={!canEdit(c.key)}
                          aria-label={canEdit(c.key) ? `Edit ${c.label}: ${a.name}` : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(a.id);
                            setEditing({ id: a.id, col: c.key, value: c.key === 'start' ? a.startDate.slice(0, 10) : c.key === 'duration' ? String(a.durationDays) : String(a.percentComplete) });
                          }}
                          className={`${cell} truncate text-left text-xs tabular-nums ${isSummary ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'} ${canEdit(c.key) ? 'cursor-text hover:bg-blue-50/70 dark:hover:bg-blue-950/30' : 'cursor-default'}`}
                          style={{ width: c.width }}
                        >
                          {value(c.key)}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="relative" style={{ width }}>
                    {base && !isSummary && !isMilestone && (
                      <div className="absolute rounded-sm" style={{ left: x(base.start), width: Math.max(px, x(base.end) + px - x(base.start)), top: ROW - 9, height: 4, background: COLOURS.baseline }} title={`Baseline ${fmtCell(base.start)} – ${fmtCell(base.end)}`} />
                    )}
                    {isSummary ? (
                      <div className="absolute" style={{ left: bx, width: bw, top: 10, height: 12 }} title={tip}>
                        <div className="absolute inset-x-0 top-0 h-[7px] rounded-sm" style={{ background: COLOURS.summary }} />
                        <div className="absolute left-0 top-0 h-[7px] rounded-sm bg-emerald-500/80" style={{ width: `${s.percent}%` }} />
                        <div className="absolute -bottom-px left-0 h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent" style={{ borderTopColor: COLOURS.summary }} />
                        <div className="absolute -bottom-px right-0 h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent" style={{ borderTopColor: COLOURS.summary }} />
                      </div>
                    ) : isMilestone ? (
                      <div className="absolute flex items-center gap-1.5" style={{ left: x(s.start) + px / 2 - 7, top: base ? 6 : 9 }}>
                        <div
                          role="img"
                          aria-label={`Milestone ${a.name}`}
                          title={tip}
                          onDoubleClick={() => onSelect(a.id)}
                          className="h-[13px] w-[13px] rotate-45 cursor-pointer rounded-[2px]"
                          style={{ background: crit ? COLOURS.criticalProgress : COLOURS.milestone }}
                        />
                        <span className="whitespace-nowrap text-[11px] font-medium text-slate-600 dark:text-slate-300">{fmt(s.start, { day: 'numeric', month: 'short' })}</span>
                      </div>
                    ) : (
                      <>
                        <div
                          role="img"
                          aria-label={`${a.name}, ${s.percent}% complete`}
                          title={tip}
                          onPointerDown={movable ? (e) => startDrag(e, a, 'move') : undefined}
                          onDoubleClick={() => onSelect(a.id)}
                          className={`absolute overflow-hidden rounded-[3px] shadow-sm ${movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${sel ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                          style={{ left: bx, width: bw, top: base ? 6 : 8, height: base ? 14 : 16, background: crit ? COLOURS.critical : COLOURS.task }}
                        >
                          <div className="h-full" style={{ width: `${a.percentComplete}%`, background: crit ? COLOURS.criticalProgress : COLOURS.taskProgress }} />
                          {data.canEdit && (
                            <span
                              aria-hidden
                              onPointerDown={(e) => startDrag(e, a, 'resize')}
                              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-white/40"
                            />
                          )}
                        </div>
                        <span className="pointer-events-none absolute whitespace-nowrap text-[11px] text-slate-600 dark:text-slate-300" style={{ left: bx + bw + 6, top: base ? 6 : 8, lineHeight: '16px' }}>
                          {dragging
                            ? dragging.kind === 'move'
                              ? `Start ${fmtCell(nextWorkingDay(s.start + shiftDays * DAY))}`
                              : `${Math.max(1, workingDaysInclusive(s.start, Math.max(s.start, s.end + stretchDays * DAY)))}d, to ${fmtCell(s.end + stretchDays * DAY)}`
                            : (assigneeLabel(a) ?? '')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <p className="sticky left-0 px-4 py-8 text-sm text-slate-400">No activities yet. Add one, or import a Microsoft Project file.</p>}
          </div>

          {/* Dependency lines */}
          <svg className="pointer-events-none absolute" style={{ left: tableWidth, top: HEADER }} width={width} height={rows.length * ROW} aria-hidden>
            <defs>
              <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOURS.link} />
              </marker>
              <marker id="gantt-arrow-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOURS.criticalProgress} />
              </marker>
            </defs>
            {links}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <Key swatch={<span className="inline-block h-2.5 w-6 rounded-sm" style={{ background: `linear-gradient(90deg, ${COLOURS.taskProgress} 50%, ${COLOURS.task} 50%)` }} />} label="Task and progress" />
        {showCritical && <Key swatch={<span className="inline-block h-2.5 w-6 rounded-sm" style={{ background: COLOURS.critical }} />} label="Critical path" />}
        <Key swatch={<span className="inline-block h-1.5 w-6 rounded-sm" style={{ background: COLOURS.summary }} />} label="Summary" />
        <Key swatch={<span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px]" style={{ background: COLOURS.milestone }} />} label="Milestone" />
        {baselineId && <Key swatch={<span className="inline-block h-1 w-6 rounded-sm" style={{ background: COLOURS.baseline }} />} label="Baseline" />}
        <Key swatch={<span className="inline-block h-3 w-0 border-l-2 border-dashed" style={{ borderColor: COLOURS.today }} />} label="Today" />
        {data.canEdit ? (
          <span>Drag a bar to move it, or its right end to change the duration. Click a duration, start or % to edit it.</span>
        ) : (
          <span>Setjeka keeps the programme; double-click a bar to see its details.</span>
        )}
      </div>
    </div>
  );
}

function Key({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}
