export type ProjectType = 'NEW_BUILD' | 'REFURBISHMENT' | 'REDEVELOPMENT' | 'RENEWAL' | 'ADDITION';
export type ContractForm = 'FIDIC' | 'JBCC' | 'GCC' | 'NEC' | 'OTHER';
export type Currency = 'ZAR' | 'USD' | 'NGN' | 'EUR' | 'GBP' | 'BWP' | 'NAD' | 'KES' | 'GHS';
export type ClassificationStandard = 'ASAQS' | 'NRM';

export const CURRENCY_LABEL: Record<Currency, string> = {
  ZAR: 'ZAR (R)',
  USD: 'USD ($)',
  NGN: 'NGN (₦)',
  EUR: 'EUR (€)',
  GBP: 'GBP (£)',
  BWP: 'BWP (P)',
  NAD: 'NAD (N$)',
  KES: 'KES (KSh)',
  GHS: 'GHS (GH₵)',
};

export const CURRENCY_OPTIONS = (Object.keys(CURRENCY_LABEL) as Currency[]).map((c) => ({ value: c, label: c }));

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  ZAR: 'R',
  USD: '$',
  NGN: '₦',
  EUR: '€',
  GBP: '£',
  BWP: 'P',
  NAD: 'N$',
  KES: 'KSh',
  GHS: 'GH₵',
};

export const CLASSIFICATION_STANDARD_LABEL: Record<ClassificationStandard, string> = {
  ASAQS: 'ASAQS (South Africa)',
  NRM: 'NRM 1/2 (RICS, pan-African)',
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  NEW_BUILD: 'New build',
  REFURBISHMENT: 'Refurbishment',
  REDEVELOPMENT: 'Redevelopment',
  RENEWAL: 'Renewal',
  ADDITION: 'Addition to existing building',
};

export const CONTRACT_FORM_LABEL: Record<ContractForm, string> = {
  FIDIC: 'FIDIC',
  JBCC: 'JBCC',
  GCC: 'GCC',
  NEC: 'NEC',
  OTHER: 'Other',
};

// FIDIC titles the PM a "project engineer" (Meeting 002 §2.6).
export function pmTitleForContractForm(contractForm: ContractForm | null | undefined): string {
  return contractForm === 'FIDIC' ? 'Project Engineer' : 'Project Manager';
}
