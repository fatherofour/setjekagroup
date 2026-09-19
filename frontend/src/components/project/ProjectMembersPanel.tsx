'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { PROJECT_MEMBER_ROLES, projectMemberRoleLabel, type ProjectMemberRole } from '@/lib/projectMemberRoles';
import type { Contractor } from '@/lib/contractors';
import { CLASSIFICATION_LABEL } from '@/lib/organisationMeta';
import { Select } from '@/components/ui/Select';

interface ProjectMember {
  id: string;
  role: ProjectMemberRole;
  userId: string | null;
  contractorId: string | null;
  externalName: string | null;
  externalCompany: string | null;
  externalEmail: string | null;
  externalPhone: string | null;
  user: { id: string; fullName: string; email: string } | null;
  contractor: { id: string; name: string; tradeType: string | null } | null;
}

const ONE_OFF = '';

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [contractors, setContractors] = useState<Contractor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectMemberRole>('CONTRACTOR');
  const [contractorId, setContractorId] = useState<string>(ONE_OFF);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await authedFetch<ProjectMember[]>(`/projects/${projectId}/members`);
      setMembers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the team directory.');
    }
  };

  const loadContractors = async () => {
    try {
      const data = await authedFetch<Contractor[]>('/contractors');
      setContractors(data);
    } catch {
      setContractors([]);
    }
  };

  useEffect(() => {
    load();
    loadContractors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const usingContractor = contractorId !== ONE_OFF;
    if (!usingContractor && !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/members`, {
        method: 'POST',
        body: usingContractor
          ? { role, contractorId, externalName: name.trim() || undefined, externalEmail: email.trim() || undefined }
          : { role, externalName: name.trim(), externalCompany: company.trim() || undefined, externalEmail: email.trim() || undefined },
      });
      setName('');
      setCompany('');
      setEmail('');
      setContractorId(ONE_OFF);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add team member.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/projects/${projectId}/members/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove team member.');
    }
  }

  const usingContractor = contractorId !== ONE_OFF;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Team</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {members === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : members.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No one has been added to this project yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((m) => {
            const title = m.user?.fullName ?? m.contractor?.name ?? m.externalName;
            const email_ = m.user?.email ?? m.externalEmail;
            const subParts = [projectMemberRoleLabel(m.role)];
            if (m.contractor) {
              subParts.push(m.contractor.tradeType ? m.contractor.tradeType : 'Contractor');
              if (m.externalName) subParts.push(`Contact: ${m.externalName}`);
            } else if (m.externalCompany) {
              subParts.push(m.externalCompany);
            }
            if (email_) subParts.push(email_);
            return (
              <li key={m.id} className="group/member flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">{subParts.join(' · ')}</p>
                </div>
                <button
                  onClick={() => remove(m.id)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/member:opacity-100 dark:hover:bg-red-950"
                  aria-label={`Remove ${title}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <Select value={role} onChange={(v) => setRole(v as ProjectMemberRole)} options={PROJECT_MEMBER_ROLES} className={inputClass} />
          <Select
            value={contractorId}
            onChange={setContractorId}
            className={`${inputClass} flex-1`}
            options={[
              { value: ONE_OFF, label: '— One-off contact (not in the list) —' },
              ...(contractors ?? []).map((c) => {
                const tag = c.classifications.map((cl) => CLASSIFICATION_LABEL[cl]).join('/') || c.tradeType;
                return { value: c.id, label: tag ? `${c.name} · ${tag}` : c.name };
              }),
            ]}
          />
        </div>

        {usingContractor ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contact person on this project (optional)"
              className={`${inputClass} flex-1`}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              type="email"
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              disabled={saving}
              className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              <UserPlus size={13} />
              Add
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${inputClass} flex-1`} />
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className={`${inputClass} flex-1`} />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              type="email"
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              <UserPlus size={13} />
              Add
            </button>
          </div>
        )}
      </form>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Company not in the list yet?{' '}
        <Link href="/contractors" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Add it to Contractors
        </Link>
        . Assigning existing Setjeka staff (not just external contacts) needs a user picker — deferred until there's a user directory to pick from.
      </p>
    </div>
  );
}
