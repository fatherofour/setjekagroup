'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, RefreshCw, UserMinus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, inputClass, primaryButton } from '@/lib/stage0';

interface PortalUser {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
}

interface Props {
  // "/clients/<id>" or "/contractors/<id>"
  basePath: string;
  title: string;
  description: string;
  defaultName?: string | null;
  defaultEmail?: string | null;
}

/** Grants an external login tied to this client or vendor. There's no email
 * provider connected, so the set-password link is shown here to copy and
 * send - same as the Administration invite flow. */
export function PortalAccessPanel({ basePath, title, description, defaultName, defaultEmail }: Props) {
  const { authedFetch } = useAuth();
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(defaultName ?? '');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    authedFetch<PortalUser[]>(`${basePath}/portal-users`)
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load portal users.'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch<{ user: PortalUser; setPasswordLink: string }>(`${basePath}/portal-users`, {
        method: 'POST',
        body: { email: email.trim(), fullName: fullName.trim() },
      });
      setLink({ email: res.user.email, url: res.setPasswordLink });
      setCopied(false);
      setFullName('');
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to grant access.');
    } finally {
      setSaving(false);
    }
  }

  async function resend(u: PortalUser) {
    setError(null);
    try {
      const res = await authedFetch<{ setPasswordLink: string }>(`${basePath}/portal-users/${u.id}/resend-invite`, { method: 'POST' });
      setLink({ email: u.email, url: res.setPasswordLink });
      setCopied(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create a new link.');
    }
  }

  async function revoke(u: PortalUser) {
    if (!confirm(`Remove portal access for ${u.fullName}? Their account stays, but it will no longer see this portal.`)) return;
    setError(null);
    try {
      await authedFetch(`${basePath}/portal-users/${u.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove access.');
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <KeyRound size={14} />
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {link && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
            Send this set-password link to {link.email}. It expires in 1 hour.
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={link.url} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copy} className={primaryButton}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {users === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No one has portal access yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{u.fullName}</p>
                <p className="truncate text-xs text-slate-400">
                  {u.email}
                  {u.status !== 'ACTIVE' && ` · ${u.status.toLowerCase()}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => resend(u)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <RefreshCw size={12} />
                New link
              </button>
              <button
                type="button"
                onClick={() => revoke(u)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                <UserMinus size={12} />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={grant} className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto] dark:border-slate-800">
        <input aria-label="Full name" placeholder="Full name" className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input aria-label="Email" type="email" placeholder="Email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" disabled={saving || !fullName.trim() || !email.trim()} className={`${primaryButton} justify-center`}>
          {saving ? 'Granting…' : 'Grant access'}
        </button>
      </form>
    </div>
  );
}
