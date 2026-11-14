'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/dates';

interface Verified {
  id: string;
  title: string;
  project: string;
  outcome: string;
  outcomeLabel: string;
  signerName: string;
  signerRole: string | null;
  signedName: string | null;
  method: string;
  signedAt: string;
  sha256: string | null;
}

/** What the QR code on every signed document opens (7 Nov 2026): the
 * platform's own record of the sign-off, so anyone holding the document can
 * confirm it is genuine and when it was agreed. No sign-in needed. */
export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<Verified | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Verified>(`/verify/${id}`)
      .then(setRecord)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'not-found' : 'The check could not be completed. Try again shortly.'));
  }, [id]);

  const approved = record?.outcome.startsWith('APPROVED');
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="grid gap-0.5 border-b border-slate-100 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="text-sm text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
      </div>
    ) : null;

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="bg-[#0e3d2c] px-5 py-4 text-white">
          <p className="text-lg font-bold tracking-wide">SETJEKA GROUP</p>
          <p className="text-sm text-emerald-100">Sign-off check</p>
        </div>
        <div className="p-5">
          {!record && !error && <p className="text-sm text-slate-500">Checking…</p>}
          {error === 'not-found' && (
            <div className="flex gap-3 rounded-lg bg-red-50 p-4 text-red-800">
              <ShieldAlert className="mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-semibold">No sign-off with this reference</p>
                <p className="mt-1 text-sm">The Setjeka platform has no record matching this QR code. Treat the document as unconfirmed and contact Setjeka Group.</p>
              </div>
            </div>
          )}
          {error && error !== 'not-found' && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
          {record && (
            <>
              <div className={`flex gap-3 rounded-lg p-4 ${approved ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                {approved ? <CheckCircle2 className="mt-0.5 shrink-0" size={20} /> : <XCircle className="mt-0.5 shrink-0" size={20} />}
                <div>
                  <p className="font-semibold">Genuine sign-off: {record.outcomeLabel}</p>
                  <p className="mt-1 text-sm">
                    Recorded in the Setjeka platform on{' '}
                    {formatDateTime(record.signedAt)} (SAST).
                  </p>
                </div>
              </div>
              <dl className="mt-4">
                {row('Document', record.title)}
                {row('Project', record.project)}
                {row('Signed by', `${record.signerName}${record.signerRole ? `, ${record.signerRole}` : ''}`)}
                {row('Name entered', record.signedName)}
                {row('Signed by way of', record.method)}
                {row('Reference', record.id)}
                {row('File fingerprint (SHA-256)', record.sha256)}
              </dl>
              <p className="mt-4 text-xs text-slate-500">
                The fingerprint identifies the signed file exactly. If a copy you hold has been altered, its fingerprint will not match this one; Setjeka Group can check a copy for you.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
