'use client';

import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';

interface Step {
  label: string;
  done: boolean;
  href?: string;
  available: boolean;
}

interface Props {
  hasProjects: boolean;
  hasSitedProjects: boolean;
}

export function GettingStarted({ hasProjects, hasSitedProjects }: Props) {
  const steps: Step[] = [
    { label: 'Create your first project', done: hasProjects, href: '/projects', available: true },
    { label: 'Add site coordinates for the map & weather', done: hasSitedProjects, href: '/projects', available: true },
    { label: 'Ask the AI assistant a question', done: false, available: false },
    { label: 'Invite your team', done: false, available: false },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  if (doneCount === steps.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Getting started</h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const content = (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                step.available ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              {step.done ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle size={16} className="shrink-0" />
              )}
              <span className="flex-1">{step.label}</span>
              {!step.available && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide dark:bg-slate-800">
                  Soon
                </span>
              )}
            </div>
          );
          return (
            <li key={step.label}>
              {step.available && !step.done && step.href ? (
                <Link href={step.href} className="block rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
