/** One way of writing money and numbers (critique V3-L-08): comma
 * thousands and a full stop for decimals, with the currency's sign in front
 * (R 75,000,000 · ₦16,410,000,000). Before, screens mixed "R 30 000 000",
 * "ZAR 75,000,000", "R75,000,000ZAR" and "0,00", depending on the browser. */
export const CURRENCY_SIGN: Record<string, string> = { ZAR: 'R ', NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

export function formatNumber(n: number, decimals = 0) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatMoney(n: number | null | undefined, currency: string | null | undefined = 'ZAR', decimals = 0) {
  if (n == null) return '—';
  const sign = CURRENCY_SIGN[currency ?? 'ZAR'] ?? `${currency} `;
  return `${n < 0 ? '-' : ''}${sign}${formatNumber(Math.abs(n), decimals)}`;
}
