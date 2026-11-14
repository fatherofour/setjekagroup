'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** A row of tabs that may not fit (critique M-15): it scrolls sideways,
 * shows a fade and an arrow on the side that has more, and keeps the current
 * tab (matched by `activeSelector`) in view. */
export function ScrollRow({
  children,
  activeSelector,
  watch,
  role,
}: {
  children: ReactNode;
  /** CSS selector for the current item, e.g. '[aria-selected="true"]'. */
  activeSelector: string;
  /** Changes when the current item changes, to scroll it into view. */
  watch: unknown;
  role?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [measure, children]);

  useEffect(() => {
    row.current?.querySelector<HTMLElement>(activeSelector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [watch, activeSelector]);

  const nudge = (dir: -1 | 1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const fade = 'absolute inset-y-0 flex w-10 items-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100';
  return (
    <div className="relative border-b border-slate-200 dark:border-slate-800">
      <div ref={row} role={role} onScroll={measure} className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {more.left && (
        <button type="button" aria-label="Show earlier tabs" onClick={() => nudge(-1)} className={`${fade} left-0 justify-start bg-gradient-to-r from-slate-50 via-slate-50/90 to-transparent pl-0.5 dark:from-slate-950 dark:via-slate-950/90`}>
          <ChevronLeft size={16} />
        </button>
      )}
      {more.right && (
        <button type="button" aria-label="Show more tabs" onClick={() => nudge(1)} className={`${fade} right-0 justify-end bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent pr-0.5 dark:from-slate-950 dark:via-slate-950/90`}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
