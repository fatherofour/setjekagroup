'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Tabs } from '@/components/ui/Tabs';
import type { CostCode, CostRegion } from '@/lib/commercial';
import { RegionsPanel } from '@/components/costs/RegionsPanel';
import { PriceSheetPanel } from '@/components/costs/PriceSheetPanel';
import { WorkItemsPanel } from '@/components/costs/WorkItemsPanel';
import { CostCodesPanel, FxRatesPanel } from '@/components/costs/CodesAndFxPanels';

const TABS = [
  { value: 'prices', label: 'Resources & prices' },
  { value: 'work-items', label: 'Work items' },
  { value: 'regions', label: 'Regions' },
  { value: 'codes', label: 'Cost codes' },
  { value: 'fx', label: 'Exchange rates' },
];
const REGION_KEY = 'setjeka_cost_region';

function CostDatabase() {
  const { authedFetch } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'prices';
  const [regions, setRegions] = useState<CostRegion[] | null>(null);
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [regionId, setRegionId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([authedFetch<CostRegion[]>('/cost-regions'), authedFetch<CostCode[]>('/cost-codes?all=true')])
      .then(([r, c]) => {
        setRegions(r);
        setCodes(c);
        setRegionId((current) => {
          if (current && r.some((x) => x.id === current)) return current;
          let saved: string | null = null;
          try {
            saved = localStorage.getItem(REGION_KEY);
          } catch {}
          return r.find((x) => x.id === saved)?.id ?? r.find((x) => x.isActive)?.id ?? r[0]?.id ?? '';
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the cost database.'));
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  function chooseRegion(id: string) {
    setRegionId(id);
    try {
      localStorage.setItem(REGION_KEY, id);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cost database</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Setjeka&apos;s own prices for materials, labour and plant, kept per region, and the build-ups that turn them into rates for measured work. Estimates price from here, and awarded RFQs update it.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <Tabs tabs={TABS} value={tab} onChange={(v) => router.replace(`/cost-database?tab=${v}`)} />
      {regions === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {tab === 'prices' && <PriceSheetPanel regions={regions} regionId={regionId} onRegionChange={chooseRegion} />}
          {tab === 'work-items' && <WorkItemsPanel regions={regions} regionId={regionId} onRegionChange={chooseRegion} costCodes={codes.filter((c) => c.isActive)} />}
          {tab === 'regions' && <RegionsPanel regions={regions} onChange={load} />}
          {tab === 'codes' && <CostCodesPanel codes={codes} onChange={load} />}
          {tab === 'fx' && <FxRatesPanel />}
        </>
      )}
    </div>
  );
}

export default function CostDatabasePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
      <CostDatabase />
    </Suspense>
  );
}
