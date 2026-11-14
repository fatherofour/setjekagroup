'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { DATE_FORMATS, DEFAULT_DATE_FORMAT, formatDate, getDateFormat } from '@/lib/dates';

/** Each person's own settings (critique M-07): for now, how dates are
 * written. DD/MM/YYYY unless they choose another. */
export default function MySettingsPage() {
  const { authedFetch } = useAuth();
  const [format, setFormat] = useState<string>(getDateFormat() ?? DEFAULT_DATE_FORMAT);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await authedFetch('/auth/me/preferences', { method: 'PATCH', body: { dateFormat: format } });
      // The signed-in copy of the account carries the setting; refresh it
      // and the page, so every screen uses the new format.
      for (const store of [localStorage, sessionStorage]) {
        try {
          const raw = store.getItem('setjeka_user');
          if (raw) store.setItem('setjeka_user', JSON.stringify({ ...JSON.parse(raw), dateFormat: format }));
        } catch {
          /* storage blocked */
        }
      }
      localStorage.setItem('setjeka.dateFormat', format);
      setSaved(true);
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your settings.');
    } finally {
      setBusy(false);
    }
  }

  const sample = new Date();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">These apply to you only, on every device you sign in on.</p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Dates</h2>
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">Date format</legend>
          {DATE_FORMATS.map((f) => (
            <label key={f.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="radio" name="dateFormat" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} className="accent-emerald-700" />
              {f.label}
              {f.value === DEFAULT_DATE_FORMAT && <span className="text-xs text-slate-400">(default)</span>}
            </label>
          ))}
        </fieldset>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Today currently reads {formatDate(sample)}.</p>
        {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={14} /> Saved</span>}
        </div>
      </section>
    </div>
  );
}
