import type { AdviceTopic, OrganisationProjectRole, ProjectMemberRole } from '../generated/prisma/enums.js';

/** PROCSA Responsibility Matrix, Stage 1 — Inception, transcribed from
 * "PROCSA Responsibility Matrix.pdf" (02 Client Inputs/Project Examples).
 * Each line item carries an `evidence` rule the app can check on its own;
 * anything it can't evidence is ticked off manually (ResponsibilityCheck). */

export type DeliverableKey =
  | 'BRIEF'
  | 'SITE_ASSESSMENT'
  | 'DESKTOP_VIABILITY'
  | 'PROCUREMENT_POLICY'
  | 'CONSENTS_SCHEDULE'
  | 'PROFESSIONAL_TEAM'
  | 'INITIATION_PROGRAMME';

/** The Stage 1 documents the client signs off (PM 1.9). All are required
 * before the project can be requested into Concept. */
export const INCEPTION_DELIVERABLES: { key: DeliverableKey; title: string; procsa: string; readyWhen: string }[] = [
  { key: 'BRIEF', title: 'Project brief', procsa: 'DM 1.1 · PM 1.1', readyWhen: 'Client requirements, objectives and constraints are written' },
  { key: 'SITE_ASSESSMENT', title: 'Preliminary site assessment', procsa: 'DM 1.2 · PM 1.4', readyWhen: 'At least one site constraint and one survey/investigation are logged' },
  { key: 'DESKTOP_VIABILITY', title: 'Preliminary desktop viability', procsa: 'DM 1.3', readyWhen: 'A preferred viability scenario is chosen' },
  { key: 'PROCUREMENT_POLICY', title: 'Project procurement policy', procsa: 'DM 1.5 · PM 1.2', readyWhen: 'Delivery strategy, tender method and contract form are set' },
  { key: 'CONSENTS_SCHEDULE', title: 'Schedule of consents and approvals', procsa: 'PM 1.7', readyWhen: 'At least one required consent is scheduled' },
  { key: 'PROFESSIONAL_TEAM', title: 'Consultant appointments, scopes and responsibilities', procsa: 'DM 1.4 · PM 1.3 / 1.5', readyWhen: 'At least one consultant is appointed, and every appointment has a scope of services and roles & responsibilities' },
  { key: 'INITIATION_PROGRAMME', title: 'Project initiation programme', procsa: 'PM 1.8', readyWhen: 'The programme has at least one activity' },
];

export type Evidence =
  | { kind: 'deliverableReady'; key: DeliverableKey }
  | { kind: 'deliverableApproved'; key: DeliverableKey }
  | { kind: 'allDeliverablesApproved' }
  | { kind: 'consultantsAppointed' }
  | { kind: 'appointmentRolesDefined' }
  | { kind: 'allAppointmentScopes' }
  | { kind: 'siteConstraintsLogged' }
  | { kind: 'briefInput' }
  | { kind: 'attendedInitiationMeeting' }
  | {
      kind: 'advice';
      topic: AdviceTopic;
      orConstraintRaised?: boolean;
      orInvestigationRecommended?: boolean;
      orServiceRecommended?: boolean;
      orCriterionRaised?: boolean;
    }
  | { kind: 'ownScope' }
  | { kind: 'ownAgreementSigned' }
  | { kind: 'informationOwned' }
  | { kind: 'informationShared' }
  | { kind: 'manual' };

export interface ResponsibilityItem {
  code: string;
  text: string;
  evidence: Evidence;
}

export interface ProcsaRole {
  key: string;
  label: string;
  // Team roles whose members count as this PROCSA role. ARCHITECT_ENGINEER
  // is the combined role from before the split, labelled
  // "Architect / Civil / Structural Engineer".
  memberRoles: ProjectMemberRole[];
  // The appointment role a consultant firm in this PROCSA role holds.
  appointmentRole?: OrganisationProjectRole;
  items: ResponsibilityItem[];
}

const BRIEF_INPUT: ResponsibilityItem = { code: '1.1', text: 'Assist in developing a clear project brief', evidence: { kind: 'briefInput' } };
const ATTEND: ResponsibilityItem = { code: '1.2', text: 'Attend project initiation meetings', evidence: { kind: 'attendedInitiationMeeting' } };
const ADVISE_PROCUREMENT: ResponsibilityItem = { code: '1.3', text: 'Advise on the procurement policy for the project', evidence: { kind: 'advice', topic: 'PROCUREMENT_POLICY' } };
const ADVISE_RIGHTS: ResponsibilityItem = {
  code: '1.4',
  text: 'Advise on rights, constraints, consents and approvals',
  evidence: { kind: 'advice', topic: 'RIGHTS_CONSTRAINTS_CONSENTS', orConstraintRaised: true },
};

function engineer(key: string, label: string, memberRoles: ProjectMemberRole[], appointmentRole: OrganisationProjectRole): ProcsaRole {
  return {
    key,
    label,
    memberRoles,
    appointmentRole,
    items: [
      BRIEF_INPUT,
      ATTEND,
      ADVISE_PROCUREMENT,
      ADVISE_RIGHTS,
      { code: '1.5', text: "Define the consultant's scope of work and services", evidence: { kind: 'ownScope' } },
      { code: '1.6', text: 'Conclude the terms of the agreement with the client', evidence: { kind: 'ownAgreementSigned' } },
      {
        code: '1.7',
        text: 'Advise on the necessary surveys, analyses, tests and site or other investigations required for stage 2, including the availability and location of infrastructure and services',
        evidence: { kind: 'advice', topic: 'SURVEYS_INVESTIGATIONS', orInvestigationRecommended: true },
      },
      { code: '1.8', text: 'Determine availability of data, drawings and plans relating to the project', evidence: { kind: 'informationOwned' } },
      { code: '1.9', text: 'Advise on appropriate financial design criteria', evidence: { kind: 'advice', topic: 'FINANCIAL_DESIGN_CRITERIA', orCriterionRaised: true } },
      { code: '1.10', text: 'Provide necessary information within the agreed scope of the project to the other consultants', evidence: { kind: 'informationShared' } },
    ],
  };
}

export const PROCSA_STAGE1_ROLES: ProcsaRole[] = [
  {
    key: 'DEVELOPMENT_MANAGER',
    label: 'Development Manager',
    memberRoles: ['DEVELOPMENT_MANAGER'],
    appointmentRole: 'DEVELOPMENT_MANAGER',
    items: [
      { code: '1.1', text: 'Formalise project brief', evidence: { kind: 'deliverableApproved', key: 'BRIEF' } },
      { code: '1.2', text: 'Facilitate preliminary site assessment', evidence: { kind: 'deliverableReady', key: 'SITE_ASSESSMENT' } },
      { code: '1.3', text: 'Prepare a preliminary desk top project viability', evidence: { kind: 'deliverableReady', key: 'DESKTOP_VIABILITY' } },
      { code: '1.4', text: 'Appoint necessary appropriate consultants', evidence: { kind: 'consultantsAppointed' } },
      { code: '1.5', text: 'Establish project procurement policy', evidence: { kind: 'deliverableReady', key: 'PROCUREMENT_POLICY' } },
    ],
  },
  {
    key: 'PROJECT_MANAGER',
    label: 'Project Manager',
    memberRoles: ['PROJECT_MANAGER'],
    appointmentRole: 'PROJECT_MANAGER',
    items: [
      { code: '1.1', text: 'Facilitate development of a clear project brief', evidence: { kind: 'deliverableReady', key: 'BRIEF' } },
      { code: '1.2', text: 'Establish procurement policy for the project', evidence: { kind: 'deliverableReady', key: 'PROCUREMENT_POLICY' } },
      {
        code: '1.3',
        text: 'Assist the client in the procurement of necessary and appropriate other consultants, including the clear definition of their roles and responsibilities',
        evidence: { kind: 'appointmentRolesDefined' },
      },
      {
        code: '1.4',
        text: 'Establish, with the client, other consultants and relevant authorities, the site characteristics, rights and constraints for the proper design of the project',
        evidence: { kind: 'siteConstraintsLogged' },
      },
      { code: '1.5', text: "Define the consultants' scope of work and services", evidence: { kind: 'allAppointmentScopes' } },
      { code: '1.6', text: 'Conclude the terms of the agreement with the client', evidence: { kind: 'ownAgreementSigned' } },
      { code: '1.7', text: 'Facilitate a schedule of the required consents and approvals', evidence: { kind: 'deliverableReady', key: 'CONSENTS_SCHEDULE' } },
      { code: '1.8', text: 'Prepare, co-ordinate and monitor a project initiation programme', evidence: { kind: 'deliverableReady', key: 'INITIATION_PROGRAMME' } },
      { code: '1.9', text: 'Facilitate client approval of all stage 1 documentation', evidence: { kind: 'allDeliverablesApproved' } },
    ],
  },
  {
    key: 'ARCHITECT',
    label: 'Architect',
    memberRoles: ['ARCHITECT', 'ARCHITECT_ENGINEER'],
    appointmentRole: 'ARCHITECT',
    items: [
      BRIEF_INPUT,
      ATTEND,
      ADVISE_PROCUREMENT,
      ADVISE_RIGHTS,
      {
        code: '1.5',
        text: 'Advise on the other consultants and services required',
        evidence: { kind: 'advice', topic: 'CONSULTANTS_REQUIRED', orServiceRecommended: true },
      },
      { code: '1.6', text: "Define the consultant's scope of work and services", evidence: { kind: 'ownScope' } },
      { code: '1.7', text: 'Determine availability of data, drawings and plans relating to the project', evidence: { kind: 'informationOwned' } },
      { code: '1.8', text: 'Provide necessary information within the agreed scope of the project to the other consultants', evidence: { kind: 'informationShared' } },
    ],
  },
  {
    key: 'QUANTITY_SURVEYOR',
    label: 'Quantity Surveyor',
    memberRoles: ['QUANTITY_SURVEYOR'],
    appointmentRole: 'QUANTITY_SURVEYOR',
    items: [
      BRIEF_INPUT,
      ATTEND,
      ADVISE_PROCUREMENT,
      {
        code: '1.4',
        text: 'Advise on other consultants and services required',
        evidence: { kind: 'advice', topic: 'CONSULTANTS_REQUIRED', orServiceRecommended: true },
      },
      { code: '1.5', text: "Define the consultant's scope of work and services", evidence: { kind: 'ownScope' } },
      { code: '1.6', text: 'Conclude the terms of the agreement with the client', evidence: { kind: 'ownAgreementSigned' } },
      { code: '1.7', text: 'Advise on economic factors affecting the project', evidence: { kind: 'advice', topic: 'ECONOMIC_FACTORS' } },
      { code: '1.8', text: 'Advise on appropriate financial design criteria', evidence: { kind: 'advice', topic: 'FINANCIAL_DESIGN_CRITERIA', orCriterionRaised: true } },
      { code: '1.9', text: 'Provide necessary information within the agreed scope of the project to the other consultants', evidence: { kind: 'informationShared' } },
    ],
  },
  engineer('STRUCTURAL_ENGINEER', 'Structural Engineer', ['STRUCTURAL_ENGINEER', 'ARCHITECT_ENGINEER'], 'STRUCTURAL_ENGINEER'),
  engineer('CIVIL_ENGINEER', 'Civil Engineer', ['CIVIL_ENGINEER', 'ARCHITECT_ENGINEER'], 'CIVIL_ENGINEER'),
  engineer('ELECTRICAL_ENGINEER', 'Electrical Engineer', ['ELECTRICAL_ENGINEER'], 'ELECTRICAL_ENGINEER'),
  engineer('MECHANICAL_ENGINEER', 'Mechanical Engineer', ['MECHANICAL_ENGINEER'], 'MECHANICAL_ENGINEER'),
];

/** A consultant firm's appointment role -> the team role its people get. */
export const MEMBER_ROLE_BY_APPOINTMENT: Partial<Record<OrganisationProjectRole, ProjectMemberRole>> = {
  ARCHITECT: 'ARCHITECT',
  CIVIL_ENGINEER: 'CIVIL_ENGINEER',
  STRUCTURAL_ENGINEER: 'STRUCTURAL_ENGINEER',
  ELECTRICAL_ENGINEER: 'ELECTRICAL_ENGINEER',
  MECHANICAL_ENGINEER: 'MECHANICAL_ENGINEER',
  QUANTITY_SURVEYOR: 'QUANTITY_SURVEYOR',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  DEVELOPMENT_MANAGER: 'DEVELOPMENT_MANAGER',
};

/** Stage 1 initiation programme template (PM 1.8): one activity per Stage
 * 1 deliverable, in the order they depend on each other. Durations are
 * working days and only a starting point — the PM adjusts them. */
export const INITIATION_PROGRAMME_TEMPLATE: { name: string; durationDays: number; milestone?: boolean }[] = [
  { name: 'Project initiation meeting', durationDays: 1 },
  { name: 'Appoint consultants and conclude agreements', durationDays: 10 },
  { name: 'Develop and formalise project brief', durationDays: 10 },
  { name: 'Preliminary site assessment, surveys and investigations scoped', durationDays: 10 },
  { name: 'Establish procurement policy', durationDays: 5 },
  { name: 'Schedule of consents and approvals', durationDays: 5 },
  { name: 'Preliminary desktop viability', durationDays: 5 },
  { name: 'Client approval of Stage 1 documentation', durationDays: 0, milestone: true },
];
