'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { PROJECT_MEMBER_ROLES, type ProjectMemberRole } from '@/lib/projectMemberRoles';
import { Select } from '@/components/ui/Select';

type PermissionModule =
  | 'SCHEDULE'
  | 'TASKS'
  | 'ISSUES'
  | 'RISKS'
  | 'DOCUMENTS'
  | 'TRANSMITTALS'
  | 'RFIS'
  | 'SUBMITTALS'
  | 'PROJECT_STRUCTURE'
  | 'TEAM'
  | 'COMMENTS';

type PermissionAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'COMMENT';

interface RolePermissionRow {
  role: ProjectMemberRole;
  module: PermissionModule;
  action: PermissionAction;
  allowed: boolean;
}

const MODULE_OPTIONS: { value: PermissionModule; label: string }[] = [
  { value: 'SCHEDULE', label: 'Schedule' },
  { value: 'TASKS', label: 'Tasks' },
  { value: 'ISSUES', label: 'Issues' },
  { value: 'RISKS', label: 'Risks' },
  { value: 'DOCUMENTS', label: 'Documents' },
  { value: 'TRANSMITTALS', label: 'Transmittals' },
  { value: 'RFIS', label: 'RFIs' },
  { value: 'SUBMITTALS', label: 'Submittals' },
  { value: 'PROJECT_STRUCTURE', label: 'Project structure' },
  { value: 'TEAM', label: 'Team' },
  { value: 'COMMENTS', label: 'Comments' },
];

const ACTIONS: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT'];

export function PermissionsMatrixPanel() {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<RolePermissionRow[] | null>(null);
  const [module, setModule] = useState<PermissionModule>('DOCUMENTS');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setRows(await authedFetch<RolePermissionRow[]>('/permissions/role-matrix'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the permission matrix.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cell = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of rows ?? []) map.set(`${r.role}:${r.module}:${r.action}`, r.allowed);
    return (role: ProjectMemberRole, action: PermissionAction) => map.get(`${role}:${module}:${action}`) ?? false;
  }, [rows, module]);

  async function toggle(role: ProjectMemberRole, action: PermissionAction) {
    if (!rows) return;
    const current = cell(role, action);
    const key = `${role}:${module}:${action}`;
    const next = rows.some((r) => `${r.role}:${r.module}:${r.action}` === key)
      ? rows.map((r) => (`${r.role}:${r.module}:${r.action}` === key ? { ...r, allowed: !current } : r))
      : [...rows, { role, module, action, allowed: !current }];
    setRows(next);
    setSaving(true);
    setError(null);
    try {
      await authedFetch('/permissions/role-matrix', {
        method: 'PATCH',
        body: { rows: [{ role, module, action, allowed: !current }] },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save — reverting.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Default permission matrix</h2>
        <Select
          value={module}
          onChange={(v) => setModule(v as PermissionModule)}
          options={MODULE_OPTIONS}
          className="h-8 w-56 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="py-2 pr-3 font-medium">Role</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-2 py-2 text-center font-medium">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROJECT_MEMBER_ROLES.map((r) => (
                <tr key={r.value} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{r.label}</td>
                  {ACTIONS.map((a) => (
                    <td key={a} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cell(r.value, a)}
                        disabled={saving}
                        onChange={() => toggle(r.value, a)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        This is the default per-role matrix for the selected module. A project can still grant an individual member
        an exception — e.g. sharing one specific document with one client for a limited time — from that record's
        own "Share externally" action.
      </p>
    </div>
  );
}
