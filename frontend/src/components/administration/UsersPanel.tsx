'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Copy, Check, Ban, RotateCcw, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
  accountType: 'INTERNAL' | 'EXTERNAL';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;
}

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const ROLE_OPTIONS = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'INTERNAL', label: 'Internal (Setjeka staff — sees every project)' },
  { value: 'EXTERNAL', label: 'External (needs a per-project grant)' },
];

export function UsersPanel() {
  const { authedFetch } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [role, setRole] = useState('MEMBER');
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      setUsers(await authedFetch<User[]>('/users'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;
    setSaving(true);
    setError(null);
    setInviteLink(null);
    try {
      const result = await authedFetch<{ setPasswordLink: string }>('/users/invite', {
        method: 'POST',
        body: { email: email.trim(), fullName: fullName.trim(), accountType, role },
      });
      setInviteLink(result.setPasswordLink);
      setEmail('');
      setFullName('');
      setAccountType('INTERNAL');
      setRole('MEMBER');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite user.');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: User['status']) {
    try {
      await authedFetch(`/users/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user status.');
    }
  }

  async function resendInvite(id: string) {
    setError(null);
    try {
      const result = await authedFetch<{ setPasswordLink: string }>(`/users/${id}/resend-invite`, { method: 'POST' });
      setInviteLink(result.setPasswordLink);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate a new link.');
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable - the link is still shown for manual copy.
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Users</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {inviteLink && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <LinkIcon size={13} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{inviteLink}</span>
          <button
            onClick={copyLink}
            className="flex shrink-0 items-center gap-1 rounded bg-emerald-700 px-2 py-1 font-medium text-white hover:bg-emerald-800"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {users === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {u.fullName}
                  {u.status !== 'ACTIVE' && (
                    <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      {u.status}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {u.email} · {u.role} · {u.accountType === 'INTERNAL' ? 'Internal' : 'External'}
                </p>
              </div>
              <button
                onClick={() => resendInvite(u.id)}
                title="Generate a new set-password link"
                className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <RotateCcw size={14} />
              </button>
              {u.status === 'ACTIVE' ? (
                <button
                  onClick={() => setStatus(u.id, 'SUSPENDED')}
                  title="Suspend"
                  className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  <Ban size={14} />
                </button>
              ) : (
                <button
                  onClick={() => setStatus(u.id, 'ACTIVE')}
                  title="Reactivate"
                  className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950"
                >
                  <Check size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className={`${inputClass} flex-1`} />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className={`${inputClass} flex-1`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={accountType}
            onChange={(v) => setAccountType(v as 'INTERNAL' | 'EXTERNAL')}
            options={ACCOUNT_TYPE_OPTIONS}
            className={`${inputClass} flex-1`}
          />
          <Select value={role} onChange={setRole} options={ROLE_OPTIONS} className={inputClass} />
          <button
            type="submit"
            disabled={saving || !email.trim() || !fullName.trim()}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            <UserPlus size={13} />
            Invite
          </button>
        </div>
      </form>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        No email provider is connected yet — copy the set-password link above and share it manually.
      </p>
    </div>
  );
}
