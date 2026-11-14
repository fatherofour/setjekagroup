'use client';

import { ScrollRow } from './ScrollRow';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

// First tabs/segmented-control primitive in this app — plain buttons with an
// active-underline, no new dependency. Used to keep multi-section pages
// (like the contractor workspace) from becoming one long scroll. A row that
// doesn't fit scrolls with a fade and arrows (ScrollRow, critique M-15).
export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <ScrollRow role="tablist" activeSelector='[aria-selected="true"]' watch={value}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                  active
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </ScrollRow>
  );
}
