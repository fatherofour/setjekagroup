'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/** A contractor's or consultant's own work with Setjeka (14 Nov 2026): their
 * own contracts, appointments and orders, never the project's value with the
 * client or another firm's contract. Renders nothing for Setjeka's staff or
 * anyone whose firm has no deals. */

interface Totals {
  currency: string;
  value: number;
  certified: number;
  paid: number;
  notYetAgreed: number;
}
interface Deal {
  kind: 'CONTRACT' | 'APPOINTMENT' | 'ORDER';
  id: string;
  firm: { id: string; name: string };
  title: string;
  status: string;
  agreed: boolean;
  currency: string;
  original: number;
  variations: number;
  value: number;
  certified: number;
  paid: number;
}
interface ProjectDeals {
  firms: { id: string; name: string }[];
  deals: Deal[];
  totals: Totals[];
}
interface OverallDeals {
  firms: { id: string; name: string }[];
  projects: { project: { id: string; name: string; projectCode: string | null }; deals: number; totals: Totals[] }[];
  totals: Totals[];
}

const SIGN: Record<string, string> = { ZAR: 'R ', NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
export const money = (n: number, currency: string) => `${SIGN[currency] ?? `${currency} `}${Math.round(n).toLocaleString('en-ZA')}`;
const KIND: Record<Deal['kind'], string> = { CONTRACT: 'Contract', APPOINTMENT: 'Appointment', ORDER: 'Order' };

const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
const firmNames = (f: { name: string }[]) => f.map((x) => x.name).join(', ');

function TotalsLine({ t }: { t: Totals }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(t.value, t.currency)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Certified {money(t.certified, t.currency)} · Paid {money(t.paid, t.currency)}
        {t.notYetAgreed > 0 && ` · ${money(t.notYetAgreed, t.currency)} not yet agreed`}
      </p>
    </div>
  );
}

/** Project overview: "Your work with Setjeka on this project". */
export function ProjectDealsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<ProjectDeals | null>(null);
  useEffect(() => {
    authedFetch<ProjectDeals>(`/projects/${projectId}/my-deals`).then(setData).catch(() => setData(null));
  }, [projectId, authedFetch]);
  if (!data || data.deals.length === 0) return null;
  return (
    <section aria-labelledby="my-deals-heading" className={card}>
      <div className="mb-3 flex items-start gap-2">
        <Banknote size={18} className="mt-0.5 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <div>
          <h2 id="my-deals-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Your work with Setjeka on this project
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{firmNames(data.firms)}: your own contracts, appointments and orders only.</p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-6">
        {data.totals.map((t) => (
          <TotalsLine key={t.currency} t={t} />
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
              <th className="py-1 pr-3 font-medium">Item</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 pr-3 text-right font-medium">Value</th>
              <th className="py-1 pr-3 text-right font-medium">Certified</th>
              <th className="py-1 text-right font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.deals.map((d) => (
              <tr key={`${d.kind}:${d.id}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3">
                  <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{KIND[d.kind]}</span>
                  <span className="text-slate-800 dark:text-slate-200">{d.title}</span>
                </td>
                <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{d.agreed ? d.status : `${d.status} (not yet agreed)`}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                  {money(d.value, d.currency)}
                  {d.variations !== 0 && (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {money(d.original, d.currency)} + variations {money(d.variations, d.currency)}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.kind === 'CONTRACT' ? money(d.certified, d.currency) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{money(d.paid, d.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Dashboard (no project chosen): the firm's overall work with Setjeka. */
export function OverallDealsCard() {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<OverallDeals | null>(null);
  useEffect(() => {
    authedFetch<OverallDeals>('/me/deals').then(setData).catch(() => setData(null));
  }, [authedFetch]);
  if (!data || data.projects.length === 0) return null;
  return (
    <section aria-labelledby="overall-deals-heading" className={card}>
      <div className="mb-3 flex items-start gap-2">
        <Banknote size={18} className="mt-0.5 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <div>
          <h2 id="overall-deals-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Your work with Setjeka
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {firmNames(data.firms)} across {data.projects.length} project{data.projects.length === 1 ? '' : 's'}. Rand and naira are totalled separately.
          </p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-6">
        {data.totals.map((t) => (
          <TotalsLine key={t.currency} t={t} />
        ))}
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.projects.map((p) => (
          <li key={p.project.id}>
            <Link href={`/projects/${p.project.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-emerald-700 dark:hover:text-emerald-400">
              <span className="flex-1 text-slate-800 dark:text-slate-200">
                {p.project.name}
                {p.project.projectCode && <span className="ml-1.5 text-xs text-slate-400">{p.project.projectCode}</span>}
              </span>
              <span className="text-right tabular-nums text-slate-700 dark:text-slate-300">{p.totals.map((t) => money(t.value, t.currency)).join(' + ')}</span>
              <ArrowRight size={14} className="text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
