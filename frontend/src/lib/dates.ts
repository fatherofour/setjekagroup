/** One way of writing dates across the app (critique M-07): DD/MM/YYYY by
 * default, or the format the person chose in their settings. Never the
 * browser's own locale, which wrote US-style 11/19/2026 on some machines. */

export const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (19/11/2026)' },
  { value: 'DD MMM YYYY', label: 'DD MMM YYYY (19 Nov 2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-11-19)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (11/19/2026)' },
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number]['value'];
export const DEFAULT_DATE_FORMAT: DateFormat = 'DD/MM/YYYY';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CACHE_KEY = 'setjeka.dateFormat';

let current: DateFormat = (() => {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(CACHE_KEY) : null;
    return DATE_FORMATS.some((f) => f.value === v) ? (v as DateFormat) : DEFAULT_DATE_FORMAT;
  } catch {
    return DEFAULT_DATE_FORMAT;
  }
})();

/** Set from the signed-in person's preference. */
export function setDateFormat(f: string | null | undefined) {
  const next = DATE_FORMATS.some((x) => x.value === f) ? (f as DateFormat) : DEFAULT_DATE_FORMAT;
  current = next;
  try {
    window.localStorage.setItem(CACHE_KEY, next);
  } catch {
    /* storage blocked: the default still applies */
  }
}

export function getDateFormat(): DateFormat {
  return current;
}

const pad = (n: number) => String(n).padStart(2, '0');
type DateInput = Date | string | number | null | undefined;

function toDate(d: DateInput): Date | null {
  if (d == null || d === '') return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

/** A date in the person's format; "—" when there is none. A date-only value
 * ("2026-11-19" or midnight UTC) keeps its calendar day in every time zone. */
export function formatDate(d: DateInput, fallback = '—'): string {
  const x = toDate(d);
  if (!x) return fallback;
  const dateOnly = typeof d === 'string' ? /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(d) : false;
  const day = dateOnly ? x.getUTCDate() : x.getDate();
  const month = dateOnly ? x.getUTCMonth() : x.getMonth();
  const year = dateOnly ? x.getUTCFullYear() : x.getFullYear();
  switch (current) {
    case 'DD MMM YYYY':
      return `${pad(day)} ${MONTHS[month]} ${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    case 'MM/DD/YYYY':
      return `${pad(month + 1)}/${pad(day)}/${year}`;
    default:
      return `${pad(day)}/${pad(month + 1)}/${year}`;
  }
}

/** A date and time (24-hour) in the person's format. */
export function formatDateTime(d: DateInput, fallback = '—'): string {
  const x = toDate(d);
  if (!x) return fallback;
  return `${formatDate(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** Read a date typed in the person's format (or ISO) back to YYYY-MM-DD;
 * null when it isn't a real date. */
export function parseDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else {
    const named = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(t);
    if (named) {
      const mi = MONTHS.findIndex((x) => x.toLowerCase() === named[2].slice(0, 3).toLowerCase());
      if (mi < 0) return null;
      [y, m, d] = [Number(named[3]), mi + 1, Number(named[1])];
    } else {
      const parts = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(t);
      if (!parts) return null;
      const a = Number(parts[1]);
      const b = Number(parts[2]);
      [y, m, d] = current === 'MM/DD/YYYY' ? [Number(parts[3]), a, b] : [Number(parts[3]), b, a];
    }
  }
  const x = new Date(Date.UTC(y, m - 1, d));
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
