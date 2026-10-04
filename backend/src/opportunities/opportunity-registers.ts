import type { FieldSpecs } from '../inception/register-fields.js';
import { REGISTERS } from '../inception/registers.js';

export interface OpportunityRegisterConfig {
  model: 'viabilityScenario' | 'marketResearch' | 'opportunityPayment' | 'developmentMilestone';
  fields: FieldSpecs;
  include?: Record<string, unknown>;
  orderBy: Record<string, 'asc' | 'desc'>[];
  // Server-set on create.
  createdByField?: 'createdById' | 'recordedById';
}

export const MILESTONE_FIELDS: FieldSpecs = {
  name: { type: 'string', required: true, max: 200 },
  baselineDate: { type: 'date' },
  targetDate: { type: 'date' },
  actualDate: { type: 'date' },
  notes: { type: 'string' },
};

/** Stage 0 registers on an opportunity. Business cases reuse the Stage 1
 * viability fields exactly — same calculator, so a scenario can carry
 * straight over into the project at conversion. */
export const OPPORTUNITY_REGISTERS: Record<string, OpportunityRegisterConfig> = {
  'business-cases': {
    model: 'viabilityScenario',
    fields: REGISTERS.viability.fields,
    include: { createdBy: { select: { fullName: true } } },
    orderBy: [{ createdAt: 'asc' }],
    createdByField: 'createdById',
  },
  'market-research': {
    model: 'marketResearch',
    fields: {
      title: { type: 'string', required: true, max: 200 },
      providerId: { type: 'contractor' },
      providerName: { type: 'string', max: 200 },
      status: { type: 'enum', values: ['COMMISSIONED', 'IN_PROGRESS', 'COMPLETED'] },
      commissionedAt: { type: 'date' },
      completedAt: { type: 'date' },
      recommendedProduct: { type: 'string' },
      targetMarket: { type: 'string' },
      achievableRentPerSqmMonth: { type: 'number', min: 0 },
      achievableSalePricePerSqm: { type: 'number', min: 0 },
      expectedVacancyPct: { type: 'number', min: 0, max: 100 },
      demandEvidence: { type: 'string' },
      findings: { type: 'string' },
    },
    include: { provider: { select: { id: true, name: true } }, recordedBy: { select: { fullName: true } } },
    orderBy: [{ createdAt: 'asc' }],
    createdByField: 'recordedById',
  },
  // Status moves only through approve / pay (opportunity-registers.service.ts).
  payments: {
    model: 'opportunityPayment',
    fields: {
      description: { type: 'string', required: true, max: 300 },
      contractorId: { type: 'contractor' },
      appointmentId: { type: 'appointment' },
      payeeName: { type: 'string', max: 200 },
      invoiceReference: { type: 'string', max: 120 },
      invoiceDate: { type: 'date' },
      amount: { type: 'number', required: true, min: 0 },
      currency: { type: 'enum', values: ['ZAR', 'USD'], required: true },
    },
    include: {
      contractor: { select: { id: true, name: true } },
      appointment: { select: { id: true, discipline: true } },
      recordedBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
    createdByField: 'recordedById',
  },
  milestones: {
    model: 'developmentMilestone',
    fields: MILESTONE_FIELDS,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
};
