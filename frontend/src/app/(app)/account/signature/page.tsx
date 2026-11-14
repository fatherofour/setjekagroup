'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { SignaturePad } from '@/components/signoff/SignaturePad';
import type { SignatureInput, SignatureMethod } from '@/lib/signoff';
import { formatDate } from '@/lib/dates';

/** The signature a person reuses when they approve (App Review, 17 Oct
 * 2026): drawn, typed in a handwriting style, or uploaded. */
export default function MySignaturePage() {
  const { authedFetch, accessToken } = useAuth();
  const [saved, setSaved] = useState<{ method: SignatureMethod; updatedAt: string } | null | undefined>(undefined);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<SignatureInput | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      authedFetch<{ method: SignatureMethod; updatedAt: string } | null>('/me/signature')
        .catch(() => null)
        .then(async (s) => {
          setSaved(s);
          setSavedUrl(s ? await apiFetchBlobUrl('/me/signature/image', accessToken).catch(() => null) : null);
        }),
    [authedFetch, accessToken],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft?.image) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await authedFetch('/me/signature', { method: 'PUT', body: { method: draft.method, image: draft.image } });
      setMessage('Saved. It will be offered the next time you sign.');
      setPadKey((k) => k + 1);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your signature.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await authedFetch('/me/signature', { method: 'DELETE' }).catch(() => {});
    setMessage('Your saved signature was removed.');
    await load();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My signature</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Used when you approve a document, drawing, variation or stage move. You can still sign afresh each time.</p>
      </div>

      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="saved-signature">
        <h2 id="saved-signature" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Saved signature
        </h2>
        {saved === undefined ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : saved ? (
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL */}
              {savedUrl && <img src={savedUrl} alt="Your saved signature" className="max-h-20" />}
            </div>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <CheckCircle2 size={13} className="text-emerald-600" /> Saved {formatDate(saved.updatedAt)}
            </p>
            <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline">
              <Trash2 size={12} /> Remove
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">None saved yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{saved ? 'Replace it' : 'Set up your signature'}</h2>
        <SignaturePad key={padKey} onChange={(s) => setDraft(s && !s.useSaved ? s : null)} allowAcceptOnly={false} />
        <button
          type="button"
          disabled={busy || !draft?.image}
          onClick={save}
          className="mt-3 h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 sm:h-9"
        >
          Save signature
        </button>
      </section>
    </div>
  );
}
