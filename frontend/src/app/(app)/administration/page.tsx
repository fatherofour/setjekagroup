'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { UsersPanel } from '@/components/administration/UsersPanel';
import { PermissionsMatrixPanel } from '@/components/administration/PermissionsMatrixPanel';
import { AuditLogPanel } from '@/components/administration/AuditLogPanel';
import { Tabs, type TabItem } from '@/components/ui/Tabs';

const ADMIN_TABS: TabItem[] = [
  { value: 'users', label: 'Users' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'audit-log', label: 'Audit Log' },
];

export default function AdministrationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return ADMIN_TABS.some((t) => t.value === requested) ? requested! : 'users';
  });

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && ADMIN_TABS.some((t) => t.value === requested)) setTab(requested);
  }, [searchParams]);

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'ADMIN') return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Administration</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage user accounts, the per-role permission matrix, and the audit trail.
        </p>
      </div>

      <Tabs tabs={ADMIN_TABS} value={tab} onChange={setTab} />

      {tab === 'users' && <UsersPanel />}
      {tab === 'permissions' && <PermissionsMatrixPanel />}
      {tab === 'audit-log' && <AuditLogPanel />}
    </div>
  );
}
