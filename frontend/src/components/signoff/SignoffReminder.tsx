'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSignature, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { clientLink } from '@/lib/portal';
import { dueLabel, dueTone } from '@/lib/signoff';

interface ApprovalItem {
  kind: string;
  id: string;
  title: string;
  context: string;
  href: string;
  dueAt: string | null;
}

const DISMISSED_KEY = 'setjeka.signoffReminder.dismissed';

/** The floating reminder a client sees on signing in when something waits
 * for their sign-off (7 Nov 2026): a stage move, the certificate of
 * completion, a variation, a payment certificate, a drawing. It stays until
 * dismissed, and comes back at the next sign-in while anything is still
 * waiting. */
export function SignoffReminder() {
  const { authedFetch, user } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const external = user?.accountType === 'EXTERNAL';

  useEffect(() => {
    if (!external) return;
    authedFetch<ApprovalItem[]>('/approvals')
      .then(setItems)
      .catch(() => setItems([]));
    // Re-checked on each page, so a decision just made drops off the list.
  }, [authedFetch, external, pathname]);

  if (!external || dismissed || items.length === 0) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* private mode: it just shows again */
    }
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-40 w-[min(22rem,calc(100vw-6rem))] overflow-hidden rounded-xl border border-amber-300 bg-white shadow-xl dark:border-amber-800 dark:bg-slate-900"
    >
      <div className="flex items-start gap-2 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/60">
        <FileSignature size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <p className="flex-1 text-sm font-semibold text-amber-900 dark:text-amber-200">
          {items.length === 1 ? 'Something needs your sign-off' : `${items.length} things need your sign-off`}
        </p>
        <button type="button" onClick={dismiss} aria-label="Hide until next sign-in" className="-m-1 flex h-8 w-8 items-center justify-center rounded-md text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900">
          <X size={16} />
        </button>
      </div>
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {items.slice(0, 5).map((i) => {
          const due = dueLabel(i.dueAt);
          return (
            <li key={`${i.kind}-${i.id}`}>
              <Link href={clientLink(i.href, user)} className="block px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{i.title}</p>
                <p className="text-xs text-slate-500">{i.context}</p>
                {due && <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${dueTone(due)}`}>{due.text}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/approvals" className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950">
        Review and sign
      </Link>
    </aside>
  );
}
