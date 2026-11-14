import { formatDay } from '../common/dates.js';
const SKIP = /^(id|projectId|opportunityId|createdAt|updatedAt|createdById|updatedById|.*Id)$/;

const human = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

function value(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return formatDay(v);
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatDay(new Date(v)) : v;
  if (typeof v === 'number') return v.toLocaleString('en-ZA');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    if (v.every((x) => typeof x === 'string')) return v.join(', ');
    const names = v
      .map((x) => (x && typeof x === 'object' ? ((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).title ?? (x as Record<string, unknown>).description ?? (x as Record<string, unknown>).role) : null))
      .filter((x): x is string => typeof x === 'string');
    return `${v.length} item${v.length === 1 ? '' : 's'}${names.length ? `: ${names.slice(0, 8).join('; ')}${names.length > 8 ? '…' : ''}` : ''}`;
  }
  return null;
}

/** What a Stage 1 document said when it was decided, as label/value lines
 * for its sign-off certificate. Nested records become one line each. */
export function snapshotFacts(snapshot: unknown, limit = 24): [string, string][] {
  const out: [string, string][] = [];
  const walk = (obj: Record<string, unknown>, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      if (out.length >= limit) return;
      if (SKIP.test(k)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        walk(v as Record<string, unknown>, `${prefix}${human(k)}: `);
        continue;
      }
      const text = value(v);
      if (text) out.push([`${prefix}${human(k)}`, text.length > 600 ? `${text.slice(0, 597)}…` : text]);
    }
  };
  if (Array.isArray(snapshot)) {
    const text = value(snapshot);
    if (text) out.push(['Contents', text]);
  } else if (snapshot && typeof snapshot === 'object') walk(snapshot as Record<string, unknown>);
  return out;
}
