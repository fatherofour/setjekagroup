'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, HardHat } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { ContractorDetail } from '@/lib/contractors';
import { CLASSIFICATION_LABEL, REGISTRATION_STATUS_LABEL, REGISTRATION_STATUS_TONE } from '@/lib/organisationMeta';
import { Tabs } from '@/components/ui/Tabs';
import { OrganisationOverviewTab } from '@/components/organisation/OrganisationOverviewTab';
import { OrganisationContactsTab } from '@/components/organisation/OrganisationContactsTab';
import { OrganisationComplianceTab } from '@/components/organisation/OrganisationComplianceTab';
import { OrganisationAppointmentsTab } from '@/components/organisation/OrganisationAppointmentsTab';
import { OrganisationFinancialTab } from '@/components/organisation/OrganisationFinancialTab';
import { OrganisationRatingsTab } from '@/components/organisation/OrganisationRatingsTab';
import { VendorScorecardPanel } from '@/components/organisation/VendorScorecardPanel';

export default function ContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { authedFetch } = useAuth();
  const [contractor, setContractor] = useState<ContractorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');

  const load = async () => {
    try {
      const data = await authedFetch<ContractorDetail>(`/contractors/${id}`);
      setContractor(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load contractor.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error && !contractor) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  }
  if (!contractor) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/contractors"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} />
          Back to contractors
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <HardHat size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{contractor.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REGISTRATION_STATUS_TONE[contractor.registrationStatus]}`}>
                {REGISTRATION_STATUS_LABEL[contractor.registrationStatus]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {contractor.classifications.length > 0
                ? contractor.classifications.map((c) => CLASSIFICATION_LABEL[c]).join(' · ')
                : 'No classification set yet'}
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'contacts', label: 'Contacts', count: contractor.contacts.length },
          { value: 'compliance', label: 'Compliance', count: contractor.complianceRecords.length },
          { value: 'appointments', label: 'Project Associations', count: contractor.appointments.length },
          { value: 'financial', label: 'Financial' },
          { value: 'ratings', label: 'Ratings' },
        ]}
      />

      <div hidden={tab !== 'overview'}>
        <OrganisationOverviewTab contractor={contractor} onSaved={load} />
      </div>
      <div hidden={tab !== 'contacts'}>
        <OrganisationContactsTab contractorId={contractor.id} onChange={load} />
      </div>
      <div hidden={tab !== 'compliance'}>
        <OrganisationComplianceTab contractorId={contractor.id} classifications={contractor.classifications} onChange={load} />
      </div>
      <div hidden={tab !== 'appointments'}>
        <OrganisationAppointmentsTab contractorId={contractor.id} onChange={load} />
      </div>
      <div hidden={tab !== 'financial'}>
        <OrganisationFinancialTab contractor={contractor} onSaved={load} />
      </div>
      <div hidden={tab !== 'ratings'}>
        <OrganisationRatingsTab contractor={contractor} onChange={load} />
        <VendorScorecardPanel contractor={contractor} />
      </div>
    </div>
  );
}
