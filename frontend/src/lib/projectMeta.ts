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
  return contractTerms(contractForm).pmTitle;
}

/** What the form of contract changes: titles, terms and the usual days to
 * certify and to pay (Meeting 002 §2.6). Keep in step with backend
 * common/contract-forms.ts. */
export interface ContractTerms {
  pmTitle: string;
  clientTitle: string;
  variation: string;
  variations: string;
  certificate: string;
  completion: string;
  certifyWithinDays: number;
  payWithinDays: number;
  noticeWithinDays: number;
  claimWithinDays: number;
  assessWithinDays: number;
  defectsPeriodDays: number;
}

const TERMS_BASE: ContractTerms = {
  pmTitle: 'Project Manager',
  clientTitle: 'Client',
  variation: 'Variation',
  variations: 'Variations',
  certificate: 'Payment certificate',
  completion: 'Practical completion',
  certifyWithinDays: 7,
  payWithinDays: 30,
  noticeWithinDays: 28,
  claimWithinDays: 28,
  assessWithinDays: 28,
  defectsPeriodDays: 90,
};

const TERMS_BY_FORM: Record<ContractForm, Partial<ContractTerms>> = {
  JBCC: { clientTitle: 'Employer', variation: 'Variation order', variations: 'Variation orders', payWithinDays: 7, noticeWithinDays: 28, claimWithinDays: 56, assessWithinDays: 42, defectsPeriodDays: 90 },
  GCC: { clientTitle: 'Employer', variation: 'Variation order', variations: 'Variation orders', completion: 'Completion', payWithinDays: 28, defectsPeriodDays: 365 },
  NEC: { clientTitle: 'Client', variation: 'Compensation event', variations: 'Compensation events', completion: 'Completion', payWithinDays: 14, noticeWithinDays: 56, claimWithinDays: 21, assessWithinDays: 14, defectsPeriodDays: 364 },
  FIDIC: { pmTitle: 'Project Engineer', clientTitle: 'Employer', certificate: 'Interim Payment Certificate', completion: 'Taking-over', certifyWithinDays: 28, payWithinDays: 28, noticeWithinDays: 28, claimWithinDays: 84, assessWithinDays: 42, defectsPeriodDays: 365 },
  OTHER: {},
};

export function contractTerms(form: ContractForm | null | undefined): ContractTerms {
  return { ...TERMS_BASE, ...(form ? TERMS_BY_FORM[form] : {}) };
}
