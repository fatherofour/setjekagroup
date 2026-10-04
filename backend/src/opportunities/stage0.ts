/** PROCSA Stage 0 — Project Initiation & Briefing, for every role the
 * matrix and the requirements register name at this stage:
 *  - Development Manager: PROCSA 0.1-0.8 (the only PROCSA role at Stage 0);
 *  - Executive: the register's DEV rows (pipeline, approvals) list an
 *    Executive alongside the DM — the go / no-go and spend approvals;
 *  - Client: PROCSA 0.3 is only "formalised" once the client confirms it.
 * Each item is evidenced automatically where possible; the rest can be
 * signed off by hand (OpportunityCheck). */

export interface Stage0Facts {
  stage: string;
  hasClient: boolean;
  needAndDesirability: boolean;
  clientVision: boolean;
  visionConfirmedAt: Date | null;
  preferredBusinessCase: { viable: boolean; profitOnCostPct: number | null } | null;
  selectedSite: { name: string; acquisitionStatus: string } | null;
  landRights: { status: string }[];
  completedResearch: number;
  appointments: number;
  payments: { status: string; approvedById: string | null }[];
  approvedDecisionAt: Date | null;
  checks: { roleKey: string; code: string; note: string | null; doneAt: Date; doneBy: { fullName: string } }[];
}

const SECURED = ['AGREEMENT_SIGNED', 'TRANSFERRED', 'LEASED'];

type Rule = (f: Stage0Facts) => string | null;

interface Item {
  code: string;
  text: string;
  rule: Rule;
  // Required for conversion into a project.
  required?: boolean;
  // Which tab of the opportunity screen does this work happen on.
  tab: string;
}

const rules: Record<string, Rule> = {
  need: (f) => (f.needAndDesirability ? 'Need and desirability written' : null),
  businessCase: (f) =>
    f.preferredBusinessCase
      ? `Preferred business case: ${f.preferredBusinessCase.profitOnCostPct?.toFixed(1) ?? '—'}% profit on cost${f.preferredBusinessCase.viable ? '' : ' (below target)'}`
      : null,
  vision: (f) => (f.clientVision && f.visionConfirmedAt ? `Confirmed by the client ${f.visionConfirmedAt.toLocaleDateString('en-ZA')}` : null),
  land: (f) => (f.selectedSite ? `Selected: ${f.selectedSite.name}` : null),
  landRights: (f) => {
    if (!f.selectedSite || !SECURED.includes(f.selectedSite.acquisitionStatus)) return null;
    if (f.landRights.length === 0 || f.landRights.some((r) => r.status !== 'APPROVED')) return null;
    return `Site secured; ${f.landRights.length} land-right approval(s) granted`;
  },
  research: (f) => (f.completedResearch > 0 ? `${f.completedResearch} market research report(s) completed` : null),
  consultants: (f) => (f.appointments > 0 ? `${f.appointments} consultant(s) appointed` : null),
  payments: (f) => {
    const live = f.payments.filter((p) => p.status !== 'REJECTED');
    if (live.length === 0 || live.some((p) => p.status !== 'PAID')) return null;
    return `All ${live.length} creditor payment(s) processed`;
  },
  decision: (f) => (f.approvedDecisionAt ? `Approved ${f.approvedDecisionAt.toLocaleDateString('en-ZA')}` : null),
  paymentsApproved: (f) => {
    const live = f.payments.filter((p) => p.status !== 'REJECTED');
    if (live.length === 0 || live.some((p) => !p.approvedById)) return null;
    return `${live.length} payment(s) approved`;
  },
  clientConfirmed: (f) => (f.visionConfirmedAt ? `Confirmed ${f.visionConfirmedAt.toLocaleDateString('en-ZA')}` : null),
};

export const STAGE0_ROLES: { key: string; label: string; source: string; items: Item[] }[] = [
  {
    key: 'DEVELOPMENT_MANAGER',
    // Meeting 3: Stage 0 is operated by the Project Manager as well as the
    // Development Manager.
    label: 'Development Manager / Project Manager',
    source: 'PROCSA Stage 0',
    items: [
      { code: '0.1', text: 'Establish project need and desirability', rule: rules.need, tab: 'overview' },
      { code: '0.2', text: 'Prepare a first business case', rule: rules.businessCase, tab: 'business' },
      { code: '0.3', text: "Formalise the client's vision", rule: rules.vision, tab: 'client' },
      { code: '0.4', text: 'Source appropriate land', rule: rules.land, tab: 'sites', required: true },
      {
        code: '0.5',
        text: 'Manage procurement of land rights, including zoning, environmental, infrastructural / external services and legal requirements',
        rule: rules.landRights,
        tab: 'approvals',
      },
      { code: '0.6', text: 'Procure market research to confirm the appropriate product and income stream', rule: rules.research, tab: 'research' },
      { code: '0.7', text: 'Appoint necessary consultants', rule: rules.consultants, tab: 'consultants' },
      { code: '0.8', text: 'Process payments to all project creditors', rule: rules.payments, tab: 'payments' },
    ],
  },
  {
    key: 'EXECUTIVE',
    label: 'Executive',
    source: 'Register DEV pipeline & approvals',
    items: [
      { code: 'E.1', text: 'Approve the investment decision to take the development forward', rule: rules.decision, tab: 'overview', required: true },
      { code: 'E.2', text: 'Approve Stage 0 payments to creditors', rule: rules.paymentsApproved, tab: 'payments' },
    ],
  },
  {
    key: 'CLIENT',
    label: 'Client',
    source: 'PROCSA 0.3',
    items: [{ code: 'C.1', text: 'Confirm the development vision', rule: rules.clientConfirmed, tab: 'client' }],
  },
];

export function evaluateStage0(f: Stage0Facts) {
  const roles = STAGE0_ROLES.map((role) => ({
    key: role.key,
    label: role.label,
    source: role.source,
    items: role.items.map((item) => {
      const evidence = item.rule(f);
      const manual = f.checks.find((c) => c.roleKey === role.key && c.code === item.code);
      return {
        code: item.code,
        text: item.text,
        tab: item.tab,
        required: Boolean(item.required),
        done: Boolean(evidence) || Boolean(manual),
        source: evidence ? ('auto' as const) : manual ? ('manual' as const) : null,
        evidence,
        manualCheck: manual ? { doneBy: manual.doneBy.fullName, doneAt: manual.doneAt, note: manual.note } : null,
      };
    }),
  }));

  // Converting needs who it's for, where it is, and the Executive's go-ahead.
  const blockers: string[] = [];
  if (!f.hasClient) blockers.push('Client captured');
  if (!f.selectedSite) blockers.push('Site selected');
  if (f.stage !== 'APPROVED') blockers.push('Investment decision approved by an Executive');
  const items = roles.flatMap((r) => r.items);
  return { roles, blockers, canConvert: blockers.length === 0, done: items.filter((i) => i.done).length, total: items.length };
}

export function isValidStage0Item(roleKey: string, code: string) {
  return STAGE0_ROLES.some((r) => r.key === roleKey && r.items.some((i) => i.code === code));
}
