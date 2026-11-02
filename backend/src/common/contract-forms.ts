import type { ContractForm } from '../generated/prisma/enums.js';

/** What the form of contract changes (Meeting 002 decision 2.6: "the
 * contract form drives role titles, terminology ... and contractual time
 * periods. Under a FIDIC agreement the project manager is titled project
 * engineer"). Keep in step with frontend lib/projectMeta.ts.
 *
 * The periods are the usual ones for each form, as defaults: each contract
 * can carry its own from its contract data. Days to certify run from the
 * valuation being submitted; days to pay run from the certificate. */
export interface ContractTerms {
  form: ContractForm | null;
  /** Setjeka's Project Manager's title. */
  pmTitle: string;
  clientTitle: string;
  variation: string;
  variations: string;
  certificate: string;
  completion: string;
  certifyWithinDays: number;
  payWithinDays: number;
}

const BASE: Omit<ContractTerms, 'form'> = {
  pmTitle: 'Project Manager',
  clientTitle: 'Client',
  variation: 'Variation',
  variations: 'Variations',
  certificate: 'Payment certificate',
  completion: 'Practical completion',
  certifyWithinDays: 7,
  payWithinDays: 30,
};

const BY_FORM: Record<ContractForm, Partial<ContractTerms>> = {
  JBCC: { clientTitle: 'Employer', variation: 'Variation order', variations: 'Variation orders', payWithinDays: 7 },
  GCC: { clientTitle: 'Employer', variation: 'Variation order', variations: 'Variation orders', completion: 'Completion', payWithinDays: 28 },
  NEC: { clientTitle: 'Client', variation: 'Compensation event', variations: 'Compensation events', completion: 'Completion', payWithinDays: 14 },
  FIDIC: {
    pmTitle: 'Project Engineer',
    clientTitle: 'Employer',
    certificate: 'Interim Payment Certificate',
    completion: 'Taking-over',
    certifyWithinDays: 28,
    payWithinDays: 28,
  },
  OTHER: {},
};

export function contractTerms(form: ContractForm | null | undefined): ContractTerms {
  return { ...BASE, ...(form ? BY_FORM[form] : {}), form: form ?? null };
}

export const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);
