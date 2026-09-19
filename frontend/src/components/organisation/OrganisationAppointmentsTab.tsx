'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Briefcase, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { OrganisationAppointment } from '@/lib/contractors';
import { APPOINTMENT_ROLES, APPOINTMENT_ROLE_LABEL, APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL } from '@/lib/organisationMeta';
import { CURRENCY_SYMBOL } from '@/lib/projectMeta';
import { Select } from '@/components/ui/Select';

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

interface ProjectOption {
  id: string;
  name: string;
  projectCode: string | null;
}

export function OrganisationAppointmentsTab({ contractorId, onChange }: { contractorId: string; onChange?: () => void }) {
  const { authedFetch } = useAuth();
  const [appointments, setAppointments] = useState<OrganisationAppointment[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState('MAIN_CONTRACTOR');
  const [appointmentStatus, setAppointmentStatus] = useState('PROPOSED');
  const [contractValue, setContractValue] = useState('');

  const load = async () => {
    try {
      const data = await authedFetch<OrganisationAppointment[]>(`/contractors/${contractorId}/appointments`);
      setAppointments(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load project associations.');
    }
  };

  useEffect(() => {
    load();
    authedFetch<ProjectOption[]>('/projects')
      .then(setProjects)
      .catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractorId}/appointments`, {
        method: 'POST',
        body: {
          projectId,
          role,
          appointmentStatus,
          contractValue: contractValue.trim() ? Number(contractValue) : undefined,
        },
      });
      setProjectId('');
      setContractValue('');
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add project association.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/contractors/${contractorId}/appointments/${id}`, { method: 'DELETE' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove project association.');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Project Associations</h2>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        The same organisation can hold different roles on different projects — role lives here, not on the organisation itself.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {appointments === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : appointments.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">Not associated with any project yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {appointments.map((a) => (
            <li key={a.id} className="group/appt flex items-center gap-3 py-2">
              <Briefcase size={14} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${a.projectId}`} className="truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">
                  {a.project.name}
                </Link>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {APPOINTMENT_ROLE_LABEL[a.role]} · {APPOINTMENT_STATUS_LABEL[a.appointmentStatus]}
                  {a.contractValue != null && a.currency ? ` · ${CURRENCY_SYMBOL[a.currency]}${a.contractValue.toLocaleString()}` : ''}
                </p>
              </div>
              <button
                onClick={() => remove(a.id)}
                className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/appt:opacity-100 dark:hover:bg-red-950"
                aria-label={`Remove association with ${a.project.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <Select
            value={projectId}
            onChange={setProjectId}
            options={[{ value: '', label: 'Select a project…' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            className={`${inputClass} flex-1`}
          />
          <Select value={role} onChange={setRole} options={APPOINTMENT_ROLES.map((r) => ({ value: r, label: APPOINTMENT_ROLE_LABEL[r] }))} className={inputClass} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={appointmentStatus}
            onChange={setAppointmentStatus}
            options={APPOINTMENT_STATUSES.map((s) => ({ value: s, label: APPOINTMENT_STATUS_LABEL[s] }))}
            className={inputClass}
          />
          <input
            type="number"
            value={contractValue}
            onChange={(e) => setContractValue(e.target.value)}
            placeholder="Contract value (optional)"
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={saving || !projectId}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            Associate
          </button>
        </div>
      </form>
    </div>
  );
}
