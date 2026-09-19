export type ProjectType = 'NEW_BUILD' | 'REFURBISHMENT' | 'REDEVELOPMENT' | 'RENEWAL' | 'ADDITION';
export type ContractForm = 'FIDIC' | 'JBCC' | 'GCC' | 'NEC' | 'OTHER';
export type Currency = 'USD' | 'ZAR';
export type ClassificationStandard = 'ASAQS' | 'NRM';

export const CURRENCY_LABEL: Record<Currency, string> = {
  USD: 'USD ($)',
  ZAR: 'ZAR (R)',
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  ZAR: 'R',
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
