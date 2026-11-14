'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

/** A company area that is Setjeka's own (critique M-10): the directory of
 * firms, clients, opportunities, estimates and the cost database. An
 * outside account gets one plain message, not tools that would then fail. */
export function SetjekaOnly({ area, children }: { area: string; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  if (user.role === 'ADMIN' || user.accountType === 'INTERNAL') return <>{children}</>;
  return (
    <div className="mx-auto mt-12 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
      <Lock size={20} className="mx-auto text-slate-400" aria-hidden />
      <h1 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{area} is for Setjeka staff</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your projects, and everything Setjeka shares with you on them, are under Projects.</p>
      <Link href="/projects" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        Go to your projects
      </Link>
    </div>
  );
}
