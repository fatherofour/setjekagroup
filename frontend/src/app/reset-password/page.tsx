'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { CREAM, GREEN, GREEN_HOVER, GREEN_TEXT, INK, FONT_DISPLAY, FONT_BODY, pillInput, pillInputStyle, focusPill, blurPill } from '@/lib/auth-theme';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="py-4 text-center">
        <h2 className="mb-2 text-lg font-semibold" style={{ fontFamily: FONT_DISPLAY, color: GREEN }}>
          Invalid reset link
        </h2>
        <p className="mb-6 text-sm" style={{ color: INK }}>
          This link is missing its reset token. Request a new one below.
        </p>
        <Link href="/forgot-password" className="text-sm font-semibold" style={{ color: GREEN }}>
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="py-4 text-center">
        <h2 className="mb-2 text-lg font-semibold" style={{ fontFamily: FONT_DISPLAY, color: GREEN }}>
          Password updated
        </h2>
        <p className="mb-6 text-sm" style={{ color: INK }}>
          Your password has been changed. Sign in with your new password.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="h-14 w-full rounded-full text-base transition-colors"
          style={{ backgroundColor: GREEN, color: GREEN_TEXT, fontFamily: FONT_DISPLAY }}
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <Link href="/login" className="mb-4 flex items-center gap-1.5 text-sm" style={{ color: 'rgba(32,30,29,.6)' }}>
        <ArrowLeft size={14} />
        Back to sign in
      </Link>

      <h2 className="mb-1 text-lg font-semibold" style={{ fontFamily: FONT_DISPLAY, color: GREEN }}>
        Choose a new password
      </h2>
      <p className="mb-6 text-sm" style={{ color: 'rgba(32,30,29,.65)' }}>
        Must be at least 8 characters.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            className={pillInput}
            style={{ ...pillInputStyle, color: GREEN, paddingRight: 44 }}
            onFocus={focusPill}
            onBlur={blurPill}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center pr-5"
            style={{ color: 'rgba(32,30,29,.5)' }}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <input
          id="reset-confirm-password"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
          minLength={8}
          className={pillInput}
          style={{ ...pillInputStyle, color: GREEN }}
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
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: CREAM, fontFamily: FONT_BODY }}>
      <div className="w-full max-w-[400px] rounded-3xl bg-white p-7 shadow-[0_12px_32px_rgba(46,43,37,.18)]">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
