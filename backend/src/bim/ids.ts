import { XMLParser } from 'fast-xml-parser';
import ExcelJS from 'exceljs';
import { OPS, type Op } from './rules.js';

export interface Check {
  field: string;
  op: Op;
  value?: string;
}

/** One requirement: which elements it applies to, and what each of them
 * must carry. */
export interface Requirement {
  id: string;
  name: string;
  description?: string;
  applicability: { ifcTypes?: string[]; conditions?: Check[] };
  checks: Check[];
}

const ATTRIBUTES: Record<string, string> = { name: 'name', objecttype: 'typeName', globalid: 'globalId', type: 'typeName', storey: 'storey', level: 'storey', material: 'material', 'ifc type': 'ifcType', ifctype: 'ifcType' };

const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as { '#text': unknown })['#text']);
  return undefined;
};

/** An IDS value facet as a check on a field: a simple value is "equals", an
 * enumeration "one of", a pattern "matches", bounds "greater/less than", and
 * no value at all "must exist". */
function valueChecks(field: string, value: any, prohibited: boolean): Check[] {
  if (prohibited) return [{ field, op: 'notExists' }];
  if (value == null) return [{ field, op: 'exists' }];
  const simple = text(value.simpleValue);
  if (simple !== undefined) return [{ field, op: 'eq', value: simple }];
  const r = value.restriction;
  if (r) {
    const en = arr(r.enumeration).map((e: any) => e?.['@_value']).filter((x: unknown) => x != null);
    if (en.length) return [{ field, op: 'in', value: en.join('|') }];
    const pattern = arr(r.pattern)[0]?.['@_value'];
    if (pattern) return [{ field, op: 'matches', value: `^(?:${pattern})$` }];
    const out: Check[] = [];
    const lo = r.minInclusive?.['@_value'] ?? r.minExclusive?.['@_value'];
    const hi = r.maxInclusive?.['@_value'] ?? r.maxExclusive?.['@_value'];
    if (lo != null) out.push({ field, op: 'gt', value: String(r.minInclusive ? Number(lo) - 1e-9 : lo) });
    if (hi != null) out.push({ field, op: 'lt', value: String(r.maxInclusive ? Number(hi) + 1e-9 : hi) });
    if (out.length) return out;
  }
  return [{ field, op: 'exists' }];
}

/** The checks a facet list (applicability or requirements) stands for.
 * Facets this app cannot test (classification, partOf) are counted so the
 * import can say what it left out. */
function facets(node: any, skipped: string[]): { ifcTypes: string[]; checks: Check[] } {
  const ifcTypes: string[] = [];
  const checks: Check[] = [];
  if (!node) return { ifcTypes, checks };
  for (const e of arr(node.entity)) {
    const n = text(e?.name?.simpleValue);
    if (n) ifcTypes.push(n.toUpperCase());
    else for (const v of arr(e?.name?.restriction?.enumeration)) if (v?.['@_value']) ifcTypes.push(String(v['@_value']).toUpperCase());
  }
  for (const p of arr(node.property)) {
    const set = text(p?.propertySet?.simpleValue);
    const base = text(p?.baseName?.simpleValue) ?? text(p?.name?.simpleValue);
    if (!set || !base) {
      skipped.push('a property facet without a fixed set and name');
      continue;
    }
    const field = /^Qto_/i.test(set) ? `quantity:${set}.${base}` : `property:${set}.${base}`;
    checks.push(...valueChecks(field, p.value, p['@_cardinality'] === 'prohibited' || p['@_minOccurs'] === '0' && p['@_maxOccurs'] === '0'));
  }
  for (const a of arr(node.attribute)) {
    const n = text(a?.name?.simpleValue);
    const field = n ? ATTRIBUTES[n.toLowerCase()] : undefined;
    if (!field) {
      skipped.push(`the attribute ${n ?? '(unnamed)'}`);
      continue;
    }
    checks.push(...valueChecks(field, a.value, a['@_cardinality'] === 'prohibited'));
  }
  for (const m of arr(node.material)) checks.push(...valueChecks('material', m?.value, m?.['@_cardinality'] === 'prohibited').map((c) => (c.op === 'eq' ? { ...c, op: 'contains' as const } : c)));
  for (const k of ['classification', 'partOf']) if (node[k]) skipped.push(`${arr(node[k]).length} ${k} facet(s)`);
  return { ifcTypes, checks };
}

/** Read a buildingSMART IDS file (0.9.x and 1.0). */
export function parseIds(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false });
  const doc = parser.parse(xml);
  const root = doc.ids;
  if (!root) throw new Error('This is not an IDS file');
  const title = text(root.info?.title) ?? null;
  const skipped: string[] = [];
  const requirements: Requirement[] = [];
  arr(root.specifications?.specification).forEach((s: any, i: number) => {
    const app = facets(s.applicability, skipped);
    const req = facets(s.requirements, skipped);
    if (!req.checks.length) return;
    requirements.push({
      id: `R${String(i + 1).padStart(3, '0')}`,
      name: s['@_name'] ?? `Specification ${i + 1}`,
      description: s['@_description'] ?? s['@_instructions'] ?? undefined,
      applicability: { ifcTypes: app.ifcTypes.length ? app.ifcTypes : undefined, conditions: app.checks.length ? app.checks : undefined },
      checks: req.checks,
    });
  });
  if (!requirements.length) throw new Error('No specification in the file has a requirement this app can check');
  return { title, requirements, skipped };
}

const RULE_WORDS: Record<string, Op> = {
  exists: 'exists', required: 'exists', 'must exist': 'exists', 'not empty': 'exists', present: 'exists',
  'not exists': 'notExists', prohibited: 'notExists', empty: 'notExists', absent: 'notExists',
  eq: 'eq', '=': 'eq', equals: 'eq', is: 'eq',
  neq: 'neq', '!=': 'neq', '<>': 'neq', 'not equals': 'neq',
  contains: 'contains', 'not contains': 'notContains', 'starts with': 'startsWith',
  '>': 'gt', 'greater than': 'gt', gt: 'gt', '<': 'lt', 'less than': 'lt', lt: 'lt',
  in: 'in', 'one of': 'in', matches: 'matches', pattern: 'matches', regex: 'matches',
};

function fieldFor(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^(property|quantity):/.test(s)) return s;
  const attr = ATTRIBUTES[s.toLowerCase()];
  if (attr) return attr;
  if (s.includes('.')) return /^Qto_/i.test(s) ? `quantity:${s}` : `property:${s}`;
  return null;
}

/** Requirements from a spreadsheet: one row per check, rows with the same
 * requirement name forming one requirement. Columns are found by their
 * headings: Requirement, IFC type, Property (Set.Name or Name / Material /
 * Storey), Rule, Value, Description. */
export async function parseRequirementSheet(buffer: Buffer, csv: boolean) {
  const rows: string[][] = [];
  if (csv) {
    for (const line of buffer.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cells: string[] = [];
      let cur = '';
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
          else if (ch === '"') q = false;
          else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',' || ch === ';') cells.push(cur), (cur = '');
        else cur += ch;
      }
      cells.push(cur);
      rows.push(cells.map((c) => c.trim()));
    }
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('The workbook is empty');
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return '';
        if (typeof v === 'object' && v && 'text' in v) return String((v as { text: unknown }).text);
        if (typeof v === 'object' && v && 'result' in v) return String((v as { result: unknown }).result ?? '');
        return String(v);
      });
      rows.push(vals.map((c) => c.trim()));
    });
  }
  const headIdx = rows.findIndex((r) => r.some((c) => /property|field|attribute/i.test(c)));
  if (headIdx < 0) throw new Error('No heading row with a Property column was found');
  const head = rows[headIdx].map((h) => h.toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const cName = col(/requirement|name|title|spec/);
  const cType = col(/ifc|entity|element|class/);
  const cField = col(/property|field|attribute/);
  const cRule = col(/rule|operator|condition|check/);
  const cValue = col(/value|expected/);
  const cDesc = col(/description|note|comment/);
  const byName = new Map<string, Requirement>();
  const skipped: string[] = [];
  rows.slice(headIdx + 1).forEach((r, i) => {
    const field = fieldFor(r[cField] ?? '');
    if (!field) {
      if ((r[cField] ?? '').trim()) skipped.push(`row ${headIdx + i + 2}: "${r[cField]}" is not a property this app can check`);
      return;
    }
    const value = cValue >= 0 ? r[cValue] || undefined : undefined;
    const ruleRaw = (cRule >= 0 ? r[cRule] : '').toLowerCase();
    const op: Op | undefined = ruleRaw ? (RULE_WORDS[ruleRaw] ?? (OPS as readonly string[]).find((o) => o.toLowerCase() === ruleRaw) as Op | undefined) : value ? 'eq' : 'exists';
    if (!op) {
      skipped.push(`row ${headIdx + i + 2}: the rule "${r[cRule]}" is not known`);
      return;
    }
    const types = cType >= 0 ? (r[cType] ?? '').split(/[,;|]/).map((t) => t.trim().toUpperCase()).filter(Boolean).map((t) => (t.startsWith('IFC') ? t : `IFC${t}`)) : [];
    const name = (cName >= 0 && r[cName]) || `${types.join('/') || 'All elements'}: ${field.replace(/^(property|quantity):/, '')}`;
    const req = byName.get(name) ?? { id: `R${String(byName.size + 1).padStart(3, '0')}`, name, description: (cDesc >= 0 && r[cDesc]) || undefined, applicability: { ifcTypes: types.length ? types : undefined }, checks: [] };
    req.checks.push({ field, op, value });
    byName.set(name, req);
  });
  if (!byName.size) throw new Error('No checkable rows were found');
  return { requirements: [...byName.values()], skipped };
}
