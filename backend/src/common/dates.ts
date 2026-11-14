/** A date written the app's default way, DD/MM/YYYY (critique V3-M-03): in
 * notifications, signed records and other text the server writes. Node's
 * `toLocaleDateString('en-ZA')` wrote 2026/11/25. The calendar day is the
 * one in South Africa (same as Nigeria's, an hour behind, for dates). */
export function formatDay(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(x);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}
