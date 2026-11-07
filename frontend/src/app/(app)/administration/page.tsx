'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { UsersPanel } from '@/components/administration/UsersPanel';
import { PermissionsMatrixPanel } from '@/components/administration/PermissionsMatrixPanel';
import { AuditLogPanel } from '@/components/administration/AuditLogPanel';
import { RecycleBinPanel } from '@/components/administration/RecycleBinPanel';
import { Tabs, type TabItem } from '@/components/ui/Tabs';

const ADMIN_TABS: TabItem[] = [
  { value: 'users', label: 'Users' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'audit-log', label: 'Audit Log' },
  { value: 'recycle-bin', label: 'Recycle bin' },
];

export default function AdministrationPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return ADMIN_TABS.some((t) => t.value === requested) ? requested! : 'users';
  });

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && ADMIN_TABS.some((t) => t.value === requested)) setTab(requested);
  }, [searchParams]);

  if (loading || !user) return <p className="text-sm text-slate-400">Loading…</p>;
  // Critique L-05: say why, rather than silently sending them elsewhere.
  if (user.role !== 'ADMIN') {
    return (
      <div role="status" className="mx-auto mt-8 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <ShieldCheck size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
        <h1 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">Administration is for administrators</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Users, permissions and the audit log are managed by Setjeka&apos;s administrators. Ask one of them if you need a change.</p>
        <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Go to the Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Administration</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage user accounts, the per-role permission matrix, the audit trail and deleted documents.
        </p>
      </div>

      <Tabs tabs={ADMIN_TABS} value={tab} onChange={setTab} />

      {tab === 'users' && <UsersPanel />}
      {tab === 'permissions' && <PermissionsMatrixPanel />}
      {tab === 'audit-log' && <AuditLogPanel />}
      {tab === 'recycle-bin' && <RecycleBinPanel />}
    </div>
  );
}
