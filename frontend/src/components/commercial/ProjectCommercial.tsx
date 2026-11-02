'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calculator, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Tabs } from '@/components/ui/Tabs';
import { RomPanel } from '@/components/estimates/RomPanel';
import { cardClass, secondaryButton } from '@/lib/stage0';
import { formatRate } from '@/lib/commercial';
import { contractTerms, type ContractForm } from '@/lib/projectMeta';
import { CostReportPanel } from './CostReportPanel';
import { BudgetPanel } from './BudgetPanel';
import { VariationsPanel } from './VariationsPanel';
import { InvoicesPanel } from './InvoicesPanel';
import { BillsPanel } from '@/components/qs/BillsPanel';
import { ContractsPanel } from '@/components/qs/ContractsPanel';
import { PriceIndicesPanel } from '@/components/qs/EscalationPanels';

interface EstimateRow {
  id: string;
  reference: string;
  name: string;
  status: 'DRAFT' | 'FINAL';
  currency: string;
  region: { name: string };
  summary: { totalExclVat: number };
}

function ProjectEstimates({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<EstimateRow[] | null>(null);

  useEffect(() => {
    authedFetch<EstimateRow[]>(`/estimates?projectId=${projectId}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [authedFetch, projectId]);

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost estimates</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Estimates priced from a region&apos;s price sheet, by hand or from a BIM/CAD model. A final estimate can become this project&apos;s budget.</p>
        </div>
        <Link href={`/estimates?projectId=${projectId}`} className={secondaryButton}>
          <Plus size={14} />
          New estimate
        </Link>
      </div>
      {rows === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No estimates for this project yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Calculator size={14} className="text-emerald-600" />
              <Link href={`/estimates/${e.id}`} className="font-medium text-slate-800 hover:underline dark:text-slate-100">
                {e.name}
              </Link>
              <span className="flex-1 text-xs text-slate-400">
                {e.reference} · {e.region.name} · {e.status === 'FINAL' ? 'final' : 'draft'}
              </span>
              <span className="tabular-nums">{formatRate(e.summary.totalExclVat, e.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Register COM (Commercial Management) on one project: cost report,
 * budget & contingency, variations, the QS's bills, contracts and
 * valuations, supplier invoices and estimates. The QS (an outside firm)
 * does the commercial work but not Setjeka's steps; the client sees the
 * cost report, decides variations and approves payment certificates. */
export function ProjectCommercial({ projectId, currency, contractForm = null, isClient, internal }: { projectId: string; currency: string; contractForm?: ContractForm | null; isClient: boolean; internal: boolean }) {
  const terms = contractTerms(contractForm);
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('ctab') ?? (isClient ? 'variations' : 'report'));
  const [version, setVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);

  const tabs = isClient
    ? [
        { value: 'variations', label: terms.variations },
        { value: 'contracts', label: `${terms.certificate}s` },
        { value: 'report', label: 'Cost report' },
      ]
    : [
        { value: 'report', label: 'Cost report' },
        { value: 'budget', label: 'Budget & contingency' },
        { value: 'variations', label: terms.variations },
        { value: 'bills', label: 'Bills & cost plans' },
        { value: 'contracts', label: 'Contracts & valuations' },
        { value: 'indices', label: 'Price indices' },
        { value: 'invoices', label: 'Supplier invoices' },
        ...(internal
          ? [
              { value: 'estimates', label: 'Estimates' },
              { value: 'rom', label: 'Rough estimate' },
            ]
          : []),
      ];

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'report' && <CostReportPanel projectId={projectId} version={version} />}
      {tab === 'budget' && <BudgetPanel projectId={projectId} onChanged={changed} internal={internal} />}
      {tab === 'variations' && <VariationsPanel projectId={projectId} currency={currency} isClient={isClient} internal={internal} terms={terms} onChanged={changed} />}
      {tab === 'bills' && !isClient && <BillsPanel projectId={projectId} internal={internal} isClient={isClient} initialPlanId={params.get('plan')} onChanged={changed} />}
      {tab === 'contracts' && <ContractsPanel projectId={projectId} internal={internal} isClient={isClient} onChanged={changed} />}
      {tab === 'indices' && !isClient && <PriceIndicesPanel projectId={projectId} />}
      {tab === 'invoices' && <InvoicesPanel projectId={projectId} readOnly={isClient || !internal} onChanged={changed} />}
      {tab === 'estimates' && internal && <ProjectEstimates projectId={projectId} />}
      {tab === 'rom' && internal && <RomPanel projectId={projectId} />}
    </div>
  );
}
