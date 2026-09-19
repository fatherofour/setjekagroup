'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { CREAM, GREEN, GREEN_HOVER, GREEN_TEXT, INK, FONT_DISPLAY, FONT_BODY, pillInput, pillInputStyle, focusPill, blurPill } from '@/lib/auth-theme';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: CREAM, fontFamily: FONT_BODY }}>
      <div className="w-full max-w-[400px] rounded-3xl bg-white p-7 shadow-[0_12px_32px_rgba(46,43,37,.18)]">
        {submitted ? (
          <div className="py-4 text-center" role="status" aria-live="polite">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50" style={{ color: GREEN }}>
              <CheckCircle2 size={28} />
            </div>
            <h2 className="mb-2 text-lg font-semibold" style={{ fontFamily: FONT_DISPLAY, color: GREEN }}>
              Check your email
            </h2>
            <p className="mb-2 text-sm" style={{ color: INK }}>
              If an account exists for {email}, we&apos;ve sent password reset instructions.
            </p>
            <p className="mb-6 text-xs" style={{ color: 'rgba(32,30,29,.55)' }}>
              Didn&apos;t receive it? Check your spam folder or try again in a few minutes.
            </p>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: GREEN }}>
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <Link href="/login" className="mb-4 flex items-center gap-1.5 text-sm" style={{ color: 'rgba(32,30,29,.6)' }}>
              <ArrowLeft size={14} />
              Back to sign in
            </Link>

            <h2 className="mb-1 text-lg font-semibold" style={{ fontFamily: FONT_DISPLAY, color: GREEN }}>
              Forgot password?
            </h2>
            <p className="mb-6 text-sm" style={{ color: 'rgba(32,30,29,.65)' }}>
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Work email"
                autoComplete="email"
                required
                aria-required="true"
                autoFocus
                className={pillInput}
                style={pillInputStyle}
                onFocus={focusPill}
                onBlur={blurPill}
              />

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="mt-0.5 shrink-0">!</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 h-14 w-full rounded-full text-base transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: GREEN, color: GREEN_TEXT, fontFamily: FONT_DISPLAY }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = GREEN_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = GREEN;
                }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
