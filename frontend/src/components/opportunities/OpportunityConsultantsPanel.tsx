'use client';

import { useEffect, useState } from 'react';
import { Plus, UserCheck, Users, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { APPOINTMENT_ROLE_LABEL, type OrganisationProjectRole } from '@/lib/organisationMeta';
import { cardClass, formatMoney, secondaryButton } from '@/lib/stage0';
import { ConsultantRfqForm } from './ConsultantRfqForm';
import { ConsultantRfqCard } from './ConsultantRfqCard';
import type { ConsultantRfq } from './consultantTypes';

interface Appointment {
  id: string;
  role: OrganisationProjectRole;
  discipline: string | null;
  contractValue: number | null;
  currency: string | null;
  rankAtAward: number | null;
  scoreAtAward: number | null;
  justification: string | null;
  createdAt: string;
  projectAppointmentId: string | null;
  contractor: { id: string; name: string; email: string | null; phone: string | null };
  rfq: { rfqNumber: string } | null;
  appointedBy: { fullName: string };
}

interface Props {
  opportunityId: string;
  opportunityName: string;
  readOnly: boolean;
  onChange: () => void;
}

/** PROCSA 0.6-0.7: appoint the professional team through competitive RFQs,
 * with the system ranking every bid on fee and track record. */
export function OpportunityConsultantsPanel({ opportunityId, opportunityName, readOnly, onChange }: Props) {
  const { authedFetch } = useAuth();
  const [rfqs, setRfqs] = useState<ConsultantRfq[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () =>
    Promise.all([
      authedFetch<ConsultantRfq[]>(`/opportunities/${opportunityId}/rfqs`),
      authedFetch<Appointment[]>(`/opportunities/${opportunityId}/appointments`),
    ])
      .then(([r, a]) => {
        setRfqs(r);
        setAppointments(a);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load consultant RFQs.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  const refresh = () => {
    load();
    onChange();
  };

  async function revoke(a: Appointment) {
    if (!confirm(`Revoke ${a.contractor.name}'s appointment? Its RFQ reopens for evaluation so you can appoint another firm.`)) return;
    try {
      await authedFetch(`/opportunities/${opportunityId}/appointments/${a.id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke appointment.');
    }
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <UserCheck size={14} />
          Indicative professional team
          <span className="font-normal text-slate-400">· PROCSA 0.7</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Indicative only and not binding. The firms are carried into the project as proposed appointments; Setjeka confirms each one, or appoints someone else, at Inception.
        </p>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {appointments === null ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : appointments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No consultants selected yet. Run an RFQ below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {appointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {a.contractor.name}
                    <span className="ml-2 text-xs font-normal text-slate-500">{a.discipline ?? APPOINTMENT_ROLE_LABEL[a.role]}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatMoney(a.contractValue, a.currency)}
                    {a.rfq && ` · ${a.rfq.rfqNumber}`}
                    {a.rankAtAward != null && ` · ranked #${a.rankAtAward}`}
                    {` · by ${a.appointedBy.fullName}, ${new Date(a.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!readOnly && !a.projectAppointmentId && (
                  <button
                    type="button"
                    onClick={() => revoke(a)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <X size={12} />
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Users size={14} />
              Consultant RFQs
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Choose a discipline, send one RFQ to every registered firm in it, and the system ranks the quotes on fee and track record.
            </p>
          </div>
          {!readOnly && !creating && (
            <button type="button" onClick={() => setCreating(true)} className={secondaryButton}>
              <Plus size={14} />
              New RFQ
            </button>
          )}
        </div>

        {creating && (
          <div className="mt-3">
            <ConsultantRfqForm
              basePath={`/opportunities/${opportunityId}/rfqs`}
              contextName={opportunityName}
              onCancel={() => setCreating(false)}
              onCreated={() => {
                setCreating(false);
                refresh();
              }}
            />
          </div>
        )}

        {rfqs === null ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : rfqs.length === 0 ? (
          !creating && <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No consultant RFQs yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {rfqs.map((r) => (
              <ConsultantRfqCard key={r.id} basePath={`/opportunities/${opportunityId}/rfqs`} rfq={r} readOnly={readOnly} onChange={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
