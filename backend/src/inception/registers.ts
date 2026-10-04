import type { FieldSpecs } from './register-fields.js';
import type { DeliverableKey } from './procsa.js';

const STAGES = ['INITIATION', 'INCEPTION', 'CONCEPT', 'DESIGN', 'DOCUMENTATION_PROCUREMENT', 'CONSTRUCTION', 'CLOSEOUT'] as const;

export const MEMBER_SELECT = {
  select: {
    id: true,
    role: true,
    externalName: true,
    user: { select: { fullName: true } },
    contractor: { select: { name: true } },
  },
} as const;

export interface RegisterConfig {
  // Prisma delegate name on PrismaService.
  model: 'siteConstraint' | 'siteInvestigation' | 'consentApproval' | 'informationItem' | 'requiredService' | 'viabilityScenario' | 'developmentMilestone' | 'designCriterion';
  fields: FieldSpecs;
  include?: Record<string, unknown>;
  orderBy: Record<string, 'asc' | 'desc'>;
  // Editing this register reopens the Stage 1 deliverable it feeds, so the
  // client never sees an approval that no longer matches the content.
  deliverable?: DeliverableKey;
  // Set server-side on create.
  createdByField?: 'createdById';
}

export const REGISTERS: Record<string, RegisterConfig> = {
  'site-constraints': {
    model: 'siteConstraint',
    fields: {
      category: { type: 'string', required: true, max: 120 },
      description: { type: 'string', required: true },
      impact: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH'] },
      status: { type: 'enum', values: ['OPEN', 'MITIGATED', 'ACCEPTED', 'RESOLVED'] },
      mitigation: { type: 'string' },
      raisedById: { type: 'member', defaultToCaller: true },
    },
    include: { raisedBy: MEMBER_SELECT },
    orderBy: { createdAt: 'asc' },
    deliverable: 'SITE_ASSESSMENT',
  },
  'site-investigations': {
    model: 'siteInvestigation',
    fields: {
      investigationType: { type: 'string', required: true, max: 160 },
      description: { type: 'string' },
      recommendedById: { type: 'member', defaultToCaller: true },
      responsibleId: { type: 'member' },
      status: { type: 'enum', values: ['RECOMMENDED', 'COMMISSIONED', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'] },
      requiredByStage: { type: 'enum', values: STAGES },
      dueDate: { type: 'date' },
      estimatedCost: { type: 'number', min: 0 },
      findings: { type: 'string' },
    },
    include: { recommendedBy: MEMBER_SELECT, responsible: MEMBER_SELECT },
    orderBy: { createdAt: 'asc' },
    deliverable: 'SITE_ASSESSMENT',
  },
  consents: {
    model: 'consentApproval',
    fields: {
      title: { type: 'string', required: true, max: 200 },
      authority: { type: 'string', max: 200 },
      category: { type: 'string', max: 120 },
      responsibleId: { type: 'member' },
      requiredByStage: { type: 'enum', values: STAGES },
      plannedSubmission: { type: 'date' },
      submittedAt: { type: 'date' },
      approvedAt: { type: 'date' },
      status: { type: 'enum', values: ['NOT_STARTED', 'IN_PREPARATION', 'SUBMITTED', 'APPROVED', 'REJECTED', 'NOT_REQUIRED'] },
      reference: { type: 'string', max: 120 },
      notes: { type: 'string' },
    },
    include: { responsible: MEMBER_SELECT },
    orderBy: { createdAt: 'asc' },
    deliverable: 'CONSENTS_SCHEDULE',
  },
  information: {
    model: 'informationItem',
    fields: {
      title: { type: 'string', required: true, max: 200 },
      category: { type: 'string', max: 120 },
      heldBy: { type: 'string', max: 200 },
      responsibleId: { type: 'member', defaultToCaller: true },
      status: { type: 'enum', values: ['REQUIRED', 'REQUESTED', 'RECEIVED', 'NOT_AVAILABLE'] },
      dueDate: { type: 'date' },
      documentId: { type: 'document' },
      notes: { type: 'string' },
    },
    include: { responsible: MEMBER_SELECT, document: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  'required-services': {
    model: 'requiredService',
    fields: {
      discipline: { type: 'string', required: true, max: 120 },
      notes: { type: 'string' },
      notRequired: { type: 'bool' },
      recommendedById: { type: 'member', defaultToCaller: true },
    },
    include: { recommendedBy: MEMBER_SELECT },
    orderBy: { createdAt: 'asc' },
    deliverable: 'PROFESSIONAL_TEAM',
  },
  viability: {
    model: 'viabilityScenario',
    fields: {
      name: { type: 'string', required: true, max: 120 },
      landCost: { type: 'number', min: 0 },
      gbaSqm: { type: 'number', min: 0 },
      constructionRatePerSqm: { type: 'number', min: 0 },
      professionalFeesPct: { type: 'number', min: 0, max: 100 },
      contingencyPct: { type: 'number', min: 0, max: 100 },
      otherCosts: { type: 'number', min: 0 },
      financeRatePct: { type: 'number', min: 0, max: 100 },
      financeMonths: { type: 'number', min: 0, max: 240, int: true },
      revenueMode: { type: 'enum', values: ['SALE', 'RENTAL'] },
      sellableAreaSqm: { type: 'number', min: 0 },
      salePricePerSqm: { type: 'number', min: 0 },
      lettableAreaSqm: { type: 'number', min: 0 },
      rentPerSqmMonth: { type: 'number', min: 0 },
      vacancyPct: { type: 'number', min: 0, max: 100 },
      capRatePct: { type: 'number', min: 0, max: 100 },
      targetProfitPct: { type: 'number', min: 0, max: 1000 },
      assumptions: { type: 'string' },
    },
    include: { createdBy: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
    deliverable: 'DESKTOP_VIABILITY',
    createdByField: 'createdById',
  },
  // QS 1.8 / engineers 1.9 financial design criteria.
  'design-criteria': {
    model: 'designCriterion',
    fields: {
      category: { type: 'string', required: true, max: 120 },
      description: { type: 'string', required: true },
      value: { type: 'number' },
      unit: { type: 'string', max: 40 },
      raisedById: { type: 'member', defaultToCaller: true },
    },
    include: { raisedBy: MEMBER_SELECT },
    orderBy: { createdAt: 'asc' },
  },
  // Register DEV R12, carried over from the opportunity (see
  // opportunities/milestones.ts).
  milestones: {
    model: 'developmentMilestone',
    fields: {
      name: { type: 'string', required: true, max: 200 },
      baselineDate: { type: 'date' },
      targetDate: { type: 'date' },
      actualDate: { type: 'date' },
      notes: { type: 'string' },
    },
    orderBy: { sortOrder: 'asc' },
  },
};
