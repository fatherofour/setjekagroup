import type { Currency } from './projectMeta';

export type ResourceType = 'MATERIAL' | 'LABOUR' | 'PLANT' | 'SUBCONTRACT' | 'OTHER';
export type TakeoffBasis = 'AREA' | 'VOLUME' | 'LENGTH' | 'COUNT';
export type CostCodeCategory = 'WORKS' | 'CONSULTANTS' | 'PROCUREMENT' | 'OVERHEADS';

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  MATERIAL: 'Material',
  LABOUR: 'Labour',
  PLANT: 'Plant & equipment',
  SUBCONTRACT: 'Subcontract',
  OTHER: 'Other',
};

export const RESOURCE_TYPE_OPTIONS = (Object.keys(RESOURCE_TYPE_LABEL) as ResourceType[]).map((v) => ({ value: v, label: RESOURCE_TYPE_LABEL[v] }));

export const TAKEOFF_BASIS_LABEL: Record<TakeoffBasis, string> = {
  AREA: 'Area (m²)',
  VOLUME: 'Volume (m³)',
  LENGTH: 'Length (m)',
  COUNT: 'Count (no.)',
};

export const COST_CODE_CATEGORY_LABEL: Record<CostCodeCategory, string> = {
  WORKS: 'Works',
  CONSULTANTS: 'Consultants',
  PROCUREMENT: 'Procurement',
  OVERHEADS: 'Overheads',
};

/** Units Setjeka is likely to use, offered as suggestions (free text). */
export const UNIT_SUGGESTIONS = ['bag', 'no.', 'm', 'm²', 'm³', 'kg', 't', 'L', 'hr', 'day', 'sheet', 'roll', 'trip', 'item', 'sum'];

export interface CostRegion {
  id: string;
  name: string;
  country: string | null;
  currency: Currency;
  notes: string | null;
  isActive: boolean;
  lastPriceUpdate?: string | null;
  _count?: { prices: number; estimates: number };
}

export interface CostCode {
  id: string;
  code: string;
  name: string;
  category: CostCodeCategory;
  sortOrder: number;
  isActive: boolean;
}

export interface CostResource {
  id: string;
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
  _count?: { components: number };
  price: { rate: number; source: string | null; effectiveDate: string; updatedAt: string; updatedBy: { fullName: string } | null } | null;
}

export interface BreakdownEntry {
  resourceId: string;
  code: string;
  name: string;
  unit: string;
  type: ResourceType;
  quantityPerUnit: number;
  price: number | null;
  amountPerUnit: number;
}

export interface PricedItem {
  rate: number;
  breakdown: BreakdownEntry[];
  missing: string[];
}

export interface WorkItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  description: string | null;
  costCode: { id: string; code: string; name: string } | null;
  takeoffBasis: TakeoffBasis | null;
  takeoffKeywords: string[];
  isActive: boolean;
  components: { id: string; quantity: number; wastePct: number; notes: string | null; resource: { id: string; code: string; name: string; unit: string; type: ResourceType } }[];
  priced: PricedItem | null;
}

/** Quantities: up to 3 decimals, no trailing zeros. */
export function formatQty(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/** Money with cents, for rates. */
export function formatRate(n: number | null | undefined, currency?: string | null) {
  if (n == null) return '—';
  return `${currency ? `${currency} ` : ''}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function costCodeLabel(c: { code: string; name: string } | null | undefined) {
  return c ? `${c.code} · ${c.name}` : 'Not coded';
}

/** Build a CSV file and hand it to the browser. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
