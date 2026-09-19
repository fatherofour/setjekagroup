'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

/* Setjeka brand tokens - scoped to this page only (not the app-wide theme).
   Ported from OpenConstructionERP's LoginPage.tsx, which cites approved
   mockups 4a (desktop) and 4b (mobile) as the source of these values. */
const CREAM = '#F9F4ED';
const SAND = '#EBDDC5';
const SAGE = '#E1EECC';
const CARD_CREAM = '#F5EAD8';
const GREEN = '#0E3D2C';
const GREEN_HOVER = '#0A2F22';
const GREEN_TEXT = '#F5EAD8';
const INK = '#201E1D';
const PHOTO_BED = '#272E1B';
const FONT_DISPLAY = "'Caprasimo', serif";
const FONT_BODY = "'Figtree', system-ui, sans-serif";

const PHOTO_FILTER = 'saturate(.66) contrast(.9) brightness(1.02)';

const SETJEKA_PROJECTS = [
  {
    src: '/setjeka/carousel/01-radisson-red-va-waterfront.jpg',
    name: 'Radisson RED V&A Waterfront',
    place: 'Cape Town, South Africa',
    msg: 'Every floor here started as a line on your programme.',
  },
  {
    src: '/setjeka/carousel/02-radisson-red-silo-district.jpg',
    name: 'Radisson RED Silo District',
    place: 'Cape Town, South Africa',
    msg: 'You closed this one out. Then you took the next one.',
  },
  {
    src: '/setjeka/carousel/03-the-silo-hotel.jpg',
    name: 'The Silo Hotel',
    place: 'V&A Waterfront, Cape Town',
    msg: 'A grain store became a landmark on your watch.',
  },
  {
    src: '/setjeka/carousel/04-radisson-blu.jpg',
    name: 'Radisson Blu',
    place: 'Victoria Island, Lagos',
    msg: 'This one stood up because you kept it moving.',
  },
  {
    src: '/setjeka/carousel/05-ibis-abidjan-plateau.jpg',
    name: 'ibis Abidjan Plateau',
    place: 'Abidjan, Côte d’Ivoire',
    msg: 'Concrete, steel and your schedule. All of it held.',
  },
  {
    src: '/setjeka/carousel/06-ibis-hotel.webp',
    name: 'ibis Hotel',
    place: 'Abidjan, Côte d’Ivoire',
    msg: 'Somewhere in this building is a call you made on a Tuesday.',
  },
] as const;

const SHOWCASE_INTERVAL_MS = 5000;
const TYPE_MS_PER_CHAR = 28;
const CARET_BLINK_MS = 900;

function useProjectShowcase() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [caretOn, setCaretOn] = useState(true);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typeTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    function stopBlink() {
      clearInterval(blinkTimer.current);
    }
    function startBlink() {
      stopBlink();
      setCaretOn(true);
      blinkTimer.current = setInterval(() => {
        setCaretOn((v) => !v);
      }, CARET_BLINK_MS);
    }
    function typeMessage(i: number) {
      const msg = SETJEKA_PROJECTS[i]!.msg;
      const start = Date.now();
      let done = false;
      clearInterval(typeTimer.current);
      setTyped('');
      startBlink();
      typeTimer.current = setInterval(() => {
        const n = Math.min(msg.length, Math.floor((Date.now() - start) / TYPE_MS_PER_CHAR));
        setTyped(msg.slice(0, n));
        if (n >= msg.length && !done) {
          done = true;
          clearInterval(typeTimer.current);
          stopBlink();
          setCaretOn(false);
        }
      }, 16);
    }
    function scheduleAdvance() {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        setIndex((prev) => {
          const next = (prev + 1) % SETJEKA_PROJECTS.length;
          typeMessage(next);
          return next;
        });
        scheduleAdvance();
      }, SHOWCASE_INTERVAL_MS);
    }
    typeMessage(0);
    scheduleAdvance();
    return () => {
      clearTimeout(advanceTimer.current);
      clearInterval(typeTimer.current);
      stopBlink();
    };
  }, []);

  const project = SETJEKA_PROJECTS[index]!;
  const counter = `${String(index + 1).padStart(2, '0')} / ${String(SETJEKA_PROJECTS.length).padStart(2, '0')}`;
  return { index, project, counter, typed, caretOn };
}

function Caret({ on }: { on: boolean }) {
  return (
    <span style={{ display: on ? 'inline-block' : 'none', width: '.5em', marginLeft: '.06em' }} aria-hidden>
      ▌
    </span>
  );
}

function PhotoStack({ index }: { index: number }) {
  return (
    <>
      {SETJEKA_PROJECTS.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={p.src}
          src={p.src}
          alt={p.name}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-[ease]"
          style={{ opacity: i === index ? 1 : 0, filter: PHOTO_FILTER }}
          draggable={false}
        />
      ))}
    </>
  );
}

function CounterBadge({ counter, small = false }: { counter: string; small?: boolean }) {
  return (
    <span
      className={`absolute tabular-nums rounded-full ${
        small ? 'right-4 top-4 px-3 py-1.5 text-xs' : 'right-6 top-6 px-3.5 py-2 text-sm'
      }`}
      style={{ backgroundColor: GREEN, color: GREEN_TEXT, fontFamily: FONT_DISPLAY, letterSpacing: '.06em' }}
    >
      {counter}
    </span>
  );
}

function DesktopShowcase() {
  const { index, project, counter, typed, caretOn } = useProjectShowcase();
  return (
    <div className="relative h-full" style={{ backgroundColor: CREAM, padding: '44px 44px 44px 0' }}>
      <div
        aria-hidden
        className="absolute h-[180px] w-[180px] rounded-full"
        style={{ right: 70, top: 22, backgroundColor: SAGE }}
      />
      <div
        className="relative h-full min-h-[560px] overflow-hidden shadow-[0_12px_32px_rgba(46,43,37,.2)]"
        style={{ borderRadius: '240px 26px 240px 26px', backgroundColor: PHOTO_BED }}
      >
        <PhotoStack index={index} />
        <CounterBadge counter={counter} />
      </div>

      <div
        className="absolute w-[396px] shadow-[0_12px_32px_rgba(46,43,37,.18)]"
        style={{ left: -29, bottom: 66, backgroundColor: CREAM, borderRadius: 26, padding: '26px 30px' }}
      >
        <p
          className="min-h-[2.6em] text-[23px] leading-[1.28] text-pretty"
          style={{ margin: '0 0 16px', fontFamily: FONT_DISPLAY, color: GREEN, letterSpacing: '-.01em' }}
        >
          {typed}
          <Caret on={caretOn} />
        </p>
        <div className="border-t pt-3" style={{ borderColor: 'rgba(32,30,29,.12)' }}>
          <p className="text-[13.5px] font-semibold" style={{ fontFamily: FONT_BODY, color: INK }}>
            {project.name}
          </p>
          <p className="text-[12.5px]" style={{ fontFamily: FONT_BODY, color: 'rgba(32,30,29,.55)' }}>
            {project.place}
          </p>
        </div>
      </div>
    </div>
  );
}

function MobileShowcase() {
  const { index, project, counter, typed, caretOn } = useProjectShowcase();
  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative h-[206px] shrink-0 overflow-hidden shadow-[0_12px_32px_rgba(46,43,37,.2)]"
        style={{ borderRadius: '130px 22px 130px 22px', backgroundColor: PHOTO_BED }}
      >
        <PhotoStack index={index} />
        <CounterBadge counter={counter} small />
      </div>
      <div
        className="relative shrink-0 shadow-[0_12px_32px_rgba(46,43,37,.14)]"
        style={{ backgroundColor: CARD_CREAM, borderRadius: 24, padding: '16px 20px' }}
      >
        <p
          className="min-h-[2.5em] text-[18px] leading-[1.26] text-pretty"
          style={{ margin: '0 0 10px', fontFamily: FONT_DISPLAY, color: GREEN }}
        >
          {typed}
          <Caret on={caretOn} />
        </p>
        <div className="border-t pt-2.5" style={{ borderColor: 'rgba(32,30,29,.12)' }}>
          <p className="text-[13px] font-semibold" style={{ fontFamily: FONT_BODY, color: INK }}>
            {project.name}
          </p>
          <p className="text-[12px]" style={{ fontFamily: FONT_BODY, color: 'rgba(32,30,29,.55)' }}>
            {project.place}
          </p>
        </div>
      </div>
    </div>
  );
}

const pillInput =
  'w-full rounded-full border bg-white text-[15px] outline-none transition-shadow placeholder:text-[rgba(32,30,29,.38)]';
const pillInputStyle = { fontFamily: FONT_BODY, color: INK, borderColor: '#0E3D2C00', padding: '16px 22px' } as const;
const passwordInputStyle = { ...pillInputStyle, color: GREEN } as const;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const spinner = (
    <svg className="mx-auto h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  const form = (compact: boolean) => (
    <form onSubmit={handleSubmit} className={compact ? 'flex flex-col gap-2.5' : 'flex flex-col gap-3'} aria-label="Sign in">
      <input
        id={compact ? 'login-email-m' : 'login-email'}
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Work email"
        autoComplete="email"
        required
        aria-required="true"
        autoFocus={!compact}
        className={pillInput}
        style={pillInputStyle}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = GREEN;
          e.currentTarget.style.outline = `2px solid ${GREEN}`;
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#0E3D2C00';
          e.currentTarget.style.outline = 'none';
        }}
      />

      <div className="relative">
        <input
          id={compact ? 'login-password-m' : 'login-password'}
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
          aria-required="true"
          minLength={8}
          className={pillInput}
          style={{ ...passwordInputStyle, paddingRight: 44 }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = GREEN;
            e.currentTarget.style.outline = `2px solid ${GREEN}`;
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#0E3D2C00';
            e.currentTarget.style.outline = 'none';
          }}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center pr-5 transition-colors"
          style={{ color: 'rgba(32,30,29,.5)' }}
          tabIndex={-1}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {compact ? null : (
        <div className="flex items-center justify-between gap-4 px-1 py-1">
          <label className="flex cursor-pointer select-none items-center gap-2.5">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-[17px] w-[17px] rounded"
              style={{ accentColor: GREEN }}
            />
            <span className="text-sm" style={{ color: 'rgba(32,30,29,.7)' }}>
              Keep me signed in
            </span>
          </label>
          <a href="/forgot-password" className="text-sm font-semibold hover:underline" style={{ color: GREEN }}>
            Forgot password?
          </a>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          <span className="mt-0.5 shrink-0">!</span>
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 h-14 w-full rounded-full text-base transition-colors disabled:opacity-70"
        style={{ backgroundColor: GREEN, color: GREEN_TEXT, fontFamily: FONT_DISPLAY }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = GREEN_HOVER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = GREEN;
        }}
      >
        {loading ? spinner : 'Sign in'}
      </button>

      {compact && (
        <div className="mt-0.5 flex items-center justify-between gap-3 px-0.5">
          <a href="/forgot-password" className="text-[13.5px] font-semibold" style={{ color: GREEN }}>
            Forgot password?
          </a>
          <span className="text-[12.5px]" style={{ color: 'rgba(32,30,29,.5)' }}>
            Internal use only
          </span>
        </div>
      )}
    </form>
  );

  return (
    <>
      {/* mobile / tablet */}
      <div className="relative h-screen overflow-hidden lg:hidden" style={{ backgroundColor: CREAM, fontFamily: FONT_BODY }}>
        <div aria-hidden className="absolute h-[240px] w-[240px] rounded-full" style={{ right: -70, top: -60, backgroundColor: SAGE }} />
        <div aria-hidden className="absolute h-[320px] w-[320px] rounded-full" style={{ left: -110, bottom: -140, backgroundColor: SAND }} />
        <div className="relative mx-auto flex h-full max-w-[430px] flex-col gap-3" style={{ padding: '28px 24px 26px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/setjeka/logo.png" alt="Setjeka Group" className="h-auto w-[104px] shrink-0" style={{ marginLeft: -4 }} draggable={false} />
          <MobileShowcase />
          <div className="relative mt-auto flex flex-col gap-2.5">
            <h2 className="text-[25px] leading-[1.12]" style={{ margin: 0, fontFamily: FONT_DISPLAY, color: GREEN }}>
              Good to see you again.
            </h2>
            {form(true)}
          </div>
        </div>
      </div>

      {/* desktop */}
      <div
        className="relative hidden h-screen overflow-hidden lg:grid"
        style={{ gridTemplateColumns: '46fr 54fr', backgroundColor: CARD_CREAM, fontFamily: FONT_BODY }}
      >
        <div aria-hidden className="absolute h-[420px] w-[420px] rounded-full" style={{ left: -160, bottom: -190, backgroundColor: SAND }} />

        <div className="relative flex flex-col" style={{ backgroundColor: CREAM, padding: '62px 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/setjeka/logo.png"
            alt="Setjeka Group"
            className="relative w-[160px] h-auto self-start object-contain"
            style={{ margin: '-16px 0 0 -6px' }}
            draggable={false}
          />

          <div className="relative flex max-w-[420px] flex-col gap-6" style={{ marginTop: 48 }}>
            <h1 className="text-[44px] leading-[1.08]" style={{ margin: 0, fontFamily: FONT_DISPLAY, color: GREEN, letterSpacing: '-.015em' }}>
              Good to see you
              <br />
              again.
            </h1>
            {form(false)}

            <p className="relative -mt-3 text-center text-[13px] font-bold" style={{ margin: '-12px 0 0', color: '#4C5A3C' }}>
              Setjeka Group © all rights reserved, 2026
              <br />
              v0.1.0
            </p>
          </div>
        </div>

        <DesktopShowcase />
      </div>
    </>
  );
}
