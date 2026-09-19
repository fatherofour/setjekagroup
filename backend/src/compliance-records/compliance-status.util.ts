import type { ComplianceRecord } from '../generated/prisma/client.js';

const EXPIRING_SOON_WINDOW_DAYS = 30;

export type ComplianceStatus = 'EXPIRED' | 'PENDING_VERIFICATION' | 'EXPIRING_SOON' | 'VALID';

// Deliberately never stored — the spec is explicit that this must be
// calculated from expiryDate, not hand-maintained. Expired always wins over
// verification state; an unverified-but-not-expired record still needs
// review before anyone should treat it as "fine".
export function computeComplianceStatus(record: Pick<ComplianceRecord, 'expiryDate' | 'verificationStatus'>): ComplianceStatus {
  const now = Date.now();
  if (record.expiryDate && record.expiryDate.getTime() < now) return 'EXPIRED';
  if (record.verificationStatus === 'PENDING' || record.verificationStatus === 'SUBMITTED') return 'PENDING_VERIFICATION';
  if (record.expiryDate) {
    const daysToExpiry = (record.expiryDate.getTime() - now) / 86_400_000;
    if (daysToExpiry <= EXPIRING_SOON_WINDOW_DAYS) return 'EXPIRING_SOON';
  }
  return 'VALID';
}
