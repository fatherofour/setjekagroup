'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Compass, Lightbulb, RotateCcw, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject } from '@/lib/current-project-context';
import { JOURNEY, PERSONA_LABEL, START, screenGuide, screenKey, welcomeTour, type GuidePersona, type GuideStep, type JourneyItem } from '@/lib/guide';

interface GuideState {
  persona: GuidePersona;
  seen: string[];
  off: boolean;
}

/** Opens the journey panel from anywhere (the header's help button). */
export const OPEN_GUIDE_EVENT = 'setjeka:open-guide';
export function openGuide() {
  window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
}

const card = 'rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900';
const primaryBtn = 'flex h-9 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600';
const quietBtn = 'flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';

/**
 * The in-app guide: a welcome tour the first time someone signs in, a tip
 * card the first time they open each screen, and their journey through the
 * whole app. What has been seen is kept on the server, so it follows the
 * person from device to device.
 */
export function Guide() {
  const { authedFetch, user } = useAuth();
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  const key = screenKey(pathname, tab);
  const [state, setState] = useState<GuideState | null>(null);
  const [panel, setPanel] = useState(false);
  const [tourAgain, setTourAgain] = useState(false);
  const [tipAgain, setTipAgain] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    authedFetch<GuideState>('/me/guide')
      .then(setState)
      .catch(() => {});
  }, [authedFetch, user]);

  useEffect(() => {
    const open = () => setPanel(true);
    window.addEventListener(OPEN_GUIDE_EVENT, open);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, open);
  }, []);

  const save = useCallback(
    (change: { seen?: string[]; off?: boolean; reset?: boolean }) => {
      setState((s) => (s ? { ...s, seen: change.reset ? [] : [...new Set([...s.seen, ...(change.seen ?? [])])], off: change.reset ? false : (change.off ?? s.off) } : s));
      authedFetch('/me/guide', { method: 'PUT', body: change }).catch(() => {});
    },
    [authedFetch],
  );

  if (!state || !user) return null;
  const firstName = user.fullName.trim().split(/\s+/)[0] || 'there';
  const showTour = tourAgain || !state.seen.includes('welcome');
  const guide = screenGuide(key, state.persona);
  const showTip = !showTour && !panel && guide && key && (tipAgain === key || (!state.off && !state.seen.includes(`screen:${key}`)));

  return (
    <>
      {showTour && (
        <WelcomeTour
          steps={welcomeTour(state.persona, firstName)}
          persona={state.persona}
          onDone={() => {
            setTourAgain(false);
            save({ seen: ['welcome'] });
          }}
        />
      )}
      {showTip && (
        <ScreenTip
          key={key}
          title={guide.title}
          steps={guide.steps}
          persona={state.persona}
          onDone={() => {
            setTipAgain(null);
            save({ seen: [`screen:${key}`] });
          }}
          onOff={() => {
            setTipAgain(null);
            save({ seen: [`screen:${key}`], off: true });
          }}
        />
      )}
      {panel && (
        <JourneyPanel
          state={state}
          hasTip={Boolean(guide)}
          onClose={() => setPanel(false)}
          onTip={() => {
            setPanel(false);
            setTipAgain(key);
          }}
          onTour={() => {
            setPanel(false);
            setTourAgain(true);
          }}
          onTips={(on) => save({ off: !on })}
          onRestart={() => {
            setPanel(false);
            save({ reset: true });
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function WelcomeTour({ steps, persona, onDone }: { steps: GuideStep[]; persona: GuidePersona; onDone: () => void }) {
  const router = useRouter();
  const { currentProject } = useCurrentProject();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{ step: number; r: Rect | null; target?: string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Find the element this step points at; it may be off screen (the menu on
  // a phone), in which case the card sits in the middle.
  useEffect(() => {
    const measure = () => {
      // "a|b": the first of these that is on screen (the menu, or on a phone its button).
      for (const t of step.target?.split('|') ?? []) {
        const r = document.querySelector<HTMLElement>(`[data-guide="${t}"]`)?.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) {
          setRect({ step: i, r: { top: r.top, left: r.left, width: r.width, height: r.height }, target: t });
          return;
        }
      }
      setRect({ step: i, r: null });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [i, step.target]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight' && !last) setI((n) => n + 1);
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onDone]);

  const r = rect?.step === i ? rect.r : null;
  const pad = 6;
  // The card goes beside the target: to the right of the menu, under the header controls.
  const W = Math.min(340, window.innerWidth - 32);
  let pos: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: W };
  if (r) {
    const right = r.left + r.width + 16;
    if (r.height > window.innerHeight / 2 && right + W < window.innerWidth) pos = { left: right, top: Math.max(16, Math.min(r.top + 80, window.innerHeight - 280)), width: W };
    else pos = { left: Math.max(16, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 16)), top: r.top + r.height + 14, width: W };
  }

  function finish() {
    onDone();
    const start = START[persona];
    if (start.href) router.push(start.href);
    else if (start.tab && currentProject) router.push(`/projects/${currentProject.id}?tab=${start.tab}`);
    else if (start.tab) router.push('/projects');
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="guide-tour-title">
      {r ? (
        <>
          {/* Four panels dim everything around the target, which stays clear. */}
          {[
            { top: 0, left: 0, right: 0, height: Math.max(0, r.top - pad) },
            { top: r.top + r.height + pad, left: 0, right: 0, bottom: 0 },
            { top: r.top - pad, left: 0, width: Math.max(0, r.left - pad), height: r.height + pad * 2 },
            { top: r.top - pad, left: r.left + r.width + pad, right: 0, height: r.height + pad * 2 },
          ].map((style, n) => (
            <div key={n} className="absolute bg-slate-950/55" style={style} />
          ))}
          <div className="pointer-events-none absolute rounded-lg ring-2 ring-emerald-400" style={{ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-slate-950/55" />
      )}
      <div ref={cardRef} tabIndex={-1} className={`absolute p-5 outline-none ${card}`} style={pos}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {i + 1} of {steps.length}
          </span>
          <button onClick={onDone} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close the tour">
            <X size={16} />
          </button>
        </div>
        <h2 id="guide-tour-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {rect?.step === i && rect.target === 'menu-button' && 'Tap this button to open the menu. '}
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {i === 0 ? (
            <button onClick={onDone} className={quietBtn}>
              Skip the tour
            </button>
          ) : (
            <button onClick={() => setI(i - 1)} className={quietBtn}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {last ? (
            <button onClick={finish} className={primaryBtn}>
              Let’s start
            </button>
          ) : (
            <button onClick={() => setI(i + 1)} className={primaryBtn}>
              {i === 0 ? 'Show me' : 'Next'} <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ScreenTip({ title, steps, persona, onDone, onOff }: { title: string; steps: GuideStep[]; persona: GuidePersona; onDone: () => void; onOff: () => void }) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <aside
      className={`fixed bottom-24 right-4 z-[60] w-[min(360px,calc(100vw-2rem))] p-4 motion-safe:animate-[guide-in_200ms_ease-out] sm:right-6 ${card}`}
      role="complementary"
      aria-label={`Tips for ${title}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <Lightbulb size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {title} · tips for the {PERSONA_LABEL[persona].toLowerCase()}
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300" aria-live="polite">
            {step.body}
          </p>
        </div>
        <button onClick={onDone} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close tips">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 pl-11">
        <div className="flex items-center gap-1" aria-hidden="true">
          {steps.length > 1 && steps.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-4 bg-emerald-600' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`} />)}
        </div>
        <div className="flex items-center gap-1">
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className={quietBtn} aria-label="Previous tip">
              <ChevronLeft size={16} />
            </button>
          )}
          {last ? (
            <button onClick={onDone} className={primaryBtn}>
              Got it
            </button>
          ) : (
            <button onClick={() => setI(i + 1)} className={primaryBtn}>
              Next <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
      <button onClick={onOff} className="mt-2 pl-11 text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:hover:text-slate-300">
        Don’t show tips on new screens
      </button>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function JourneyPanel({
  state,
  hasTip,
  onClose,
  onTip,
  onTour,
  onTips,
  onRestart,
}: {
  state: GuideState;
  hasTip: boolean;
  onClose: () => void;
  onTip: () => void;
  onTour: () => void;
  onTips: (on: boolean) => void;
  onRestart: () => void;
}) {
  const { currentProject } = useCurrentProject();
  const sections = JOURNEY[state.persona];
  const seen = useMemo(() => new Set(state.seen), [state.seen]);
  const all = sections.flatMap((x) => x.items);
  const done = new Set(all.filter((x) => seen.has(`screen:${x.screen}`)).map((x) => x.screen));
  const total = new Set(all.map((x) => x.screen)).size;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const href = (x: JourneyItem) => (x.href ? x.href : currentProject ? `/projects/${currentProject.id}${x.path ?? `?tab=${x.tab}`}` : '/projects');

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="guide-panel-title">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:w-[420px]">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass size={18} className="text-emerald-700 dark:text-emerald-400" />
              <h2 id="guide-panel-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Your guide
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{PERSONA_LABEL[state.persona]}</span>
            </div>
            <button ref={closeRef} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close the guide">
              <X size={18} />
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Everything you do on Setjeka, from start to finish, in the order you’ll do it. A screen gets a tick once you’ve been through its tips.</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done.size} aria-label="Screens visited">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${total ? (done.size / total) * 100 : 0}%` }} />
            </div>
            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {done.size} of {total}
            </span>
          </div>
          {!currentProject && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">Choose a project at the top first. Project screens open for that project.</p>}
        </div>

        <ol className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
          {sections.map((sec, n) => (
            <li key={sec.title}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{n + 1}</span>
                {sec.title}
              </h3>
              <ul className="space-y-1">
                {sec.items.map((x) => {
                  const ok = seen.has(`screen:${x.screen}`);
                  return (
                    <li key={`${x.screen}-${x.label}`}>
                      <Link href={href(x)} onClick={onClose} className="group flex items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Visited" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600" aria-label="Not yet" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800 group-hover:text-emerald-800 dark:text-slate-100 dark:group-hover:text-emerald-300">{x.label}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{x.what}</span>
                        </span>
                        <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>

        <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {hasTip && (
              <button onClick={onTip} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Lightbulb size={14} /> Tips for this screen
              </button>
            )}
            <button onClick={onTour} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Compass size={14} /> Welcome tour
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={!state.off} onChange={(e) => onTips(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
              Show tips on new screens
            </label>
            <button onClick={onRestart} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200">
              <RotateCcw size={12} /> Start again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
