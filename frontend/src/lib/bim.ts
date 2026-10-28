// The BIM hub, coordination, clash detection, smart views and BIM
// requirements (chosen from OpenConstructionERP, 26 Oct 2026). Keep the
// rule language in step with backend/src/bim/rules.ts.

export type Op = 'eq' | 'neq' | 'contains' | 'notContains' | 'startsWith' | 'exists' | 'notExists' | 'gt' | 'lt' | 'in' | 'matches';
export interface Condition {
  field: string;
  op: Op;
  value?: string;
}
export interface Selection {
  documentIds?: string[];
  ifcTypes?: string[];
  storeys?: string[];
  conditions?: Condition[];
}

export const OP_LABEL: Record<Op, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  exists: 'has a value',
  notExists: 'is empty',
  gt: 'is more than',
  lt: 'is less than',
  in: 'is one of (a|b|c)',
  matches: 'matches the pattern',
};
export const NO_VALUE: Op[] = ['exists', 'notExists'];

export const BASE_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'typeName', label: 'Type name' },
  { value: 'storey', label: 'Storey' },
  { value: 'material', label: 'Material' },
  { value: 'ifcType', label: 'IFC class' },
  { value: 'globalId', label: 'GlobalId' },
];

export function fieldLabel(f: string) {
  if (f.startsWith('property:')) return f.slice(9);
  if (f.startsWith('quantity:')) return `${f.slice(9)} (quantity)`;
  return BASE_FIELDS.find((b) => b.value === f)?.label ?? f;
}

/** "IfcWallStandardCase" -> "Wall standard case". */
export function ifcLabel(t: string | null | undefined) {
  if (!t) return '—';
  const s = t.replace(/^ifc/i, '');
  const words = (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s).replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export function describeSelection(s: Selection | null | undefined, modelName: (id: string) => string) {
  if (!s) return 'Everything';
  const bits: string[] = [];
  if (s.ifcTypes?.length) bits.push(s.ifcTypes.map(ifcLabel).join(', '));
  else bits.push('All elements');
  if (s.documentIds?.length) bits.push(`in ${s.documentIds.map(modelName).join(' + ')}`);
  if (s.storeys?.length) bits.push(`on ${s.storeys.join(', ')}`);
  for (const c of s.conditions ?? []) bits.push(`where ${fieldLabel(c.field)} ${OP_LABEL[c.op]}${NO_VALUE.includes(c.op) ? '' : ` "${c.value ?? ''}"`}`);
  return bits.join(' ');
}

export interface BimModel {
  id: string;
  name: string;
  discipline: string | null;
  clientVisible: boolean;
  revisions: { id: string; revisionNumber: string; originalFilename: string; fileSize: number; uploadedAt: string; uploadedBy: { fullName: string } }[];
  linkCount: number;
}

export interface Facets {
  types: { value: string; count: number }[];
  storeys: { value: string | null; count: number }[];
}

export interface BimElement {
  id: string;
  documentId: string;
  revisionId: string;
  expressId: number;
  globalId: string;
  ifcType: string;
  name: string | null;
  typeName: string | null;
  storey: string | null;
  material: string | null;
  properties: Record<string, string | number | boolean>;
  quantities: Record<string, number>;
}

export type ClashStatus = 'NEW' | 'ACTIVE' | 'RESOLVED' | 'APPROVED';
export const CLASH_STATUS: Record<ClashStatus, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  ACTIVE: { label: 'Active', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  RESOLVED: { label: 'Resolved', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  APPROVED: { label: 'Approved', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
};

export const scoreTone = (s: number | null | undefined) =>
  s == null ? 'text-slate-400' : s >= 90 ? 'text-emerald-700 dark:text-emerald-400' : s >= 60 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400';
