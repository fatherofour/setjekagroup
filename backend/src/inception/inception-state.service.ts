import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectMemberRole } from '../generated/prisma/enums.js';
import { INCEPTION_DELIVERABLES, PROCSA_STAGE1_ROLES, type DeliverableKey, type Evidence, type ProcsaRole } from './procsa.js';

export type InceptionState = Awaited<ReturnType<InceptionStateService['load']>>;

export interface ResponsibilityStatus {
  code: string;
  text: string;
  // What would evidence it — the "My Stage 1" workspace uses this to offer
  // the right action next to each item.
  evidenceRule: Evidence;
  done: boolean;
  source: 'auto' | 'manual' | null;
  evidence: string | null;
  manualCheck: { doneBy: string; doneAt: Date; note: string | null } | null;
}

const present = (s: string | null | undefined) => Boolean(s && s.trim());

/** Everything the Stage 1 checks need, loaded in one go. Deliverable
 * readiness and the per-role responsibility tracker are both computed from
 * this, so the two can never disagree with each other. */
@Injectable()
export class InceptionStateService {
  constructor(private readonly prisma: PrismaService) {}

  async load(projectId: string) {
    const [
      project,
      brief,
      policy,
      constraints,
      investigations,
      preferredScenario,
      consentCount,
      appointments,
      activityCount,
      deliverables,
      members,
      briefComments,
      advice,
      attendance,
      informationItems,
      transmittals,
      requiredServices,
      manualChecks,
      criteria,
    ] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, stage: true, contractForm: true, name: true } }),
      this.prisma.projectBrief.findUnique({ where: { projectId } }),
      this.prisma.procurementPolicy.findUnique({ where: { projectId } }),
      this.prisma.siteConstraint.findMany({ where: { projectId }, select: { raisedBy: { select: { role: true } } } }),
      this.prisma.siteInvestigation.findMany({ where: { projectId }, select: { recommendedBy: { select: { role: true } } } }),
      this.prisma.viabilityScenario.findFirst({ where: { projectId, isPreferred: true }, select: { id: true } }),
      this.prisma.consentApproval.count({ where: { projectId } }),
      this.prisma.organisationProjectAppointment.findMany({
        // Firm appointments only: an indicative Stage 0 pick (PROPOSED)
        // doesn't count until it is confirmed.
        where: { projectId, appointmentStatus: { in: ['APPOINTED', 'ACTIVE', 'COMPLETED'] } },
        select: { role: true, scopeOfWork: true, rolesAndResponsibilities: true, agreementStatus: true, contractor: { select: { name: true } } },
      }),
      this.prisma.scheduleActivity.count({ where: { projectId } }),
      this.prisma.stageDeliverable.findMany({ where: { projectId, stage: 'INCEPTION' } }),
      this.prisma.projectMember.findMany({ where: { projectId }, select: { id: true, role: true, userId: true } }),
      this.prisma.comment.findMany({ where: { projectId, entityType: 'PROJECT_BRIEF' }, select: { authorId: true } }),
      this.prisma.consultantAdvice.findMany({ where: { projectId }, select: { topic: true, authorRole: true } }),
      this.prisma.meetingAttendee.findMany({
        where: { present: true, meeting: { projectId, meetingType: 'INITIATION', status: 'HELD' } },
        select: { projectMember: { select: { role: true } } },
      }),
      this.prisma.informationItem.findMany({ where: { projectId }, select: { responsible: { select: { role: true } } } }),
      this.prisma.transmittal.findMany({ where: { projectId, status: { not: 'DRAFT' } }, select: { fromMember: { select: { role: true } } } }),
      this.prisma.requiredService.findMany({ where: { projectId }, select: { recommendedBy: { select: { role: true } } } }),
      this.prisma.responsibilityCheck.findMany({ where: { projectId, stage: 'INCEPTION' }, include: { doneBy: { select: { fullName: true } } } }),
      this.prisma.designCriterion.findMany({ where: { projectId }, select: { raisedBy: { select: { role: true } } } }),
    ]);

    const rolesOfUser = new Map<string, ProjectMemberRole[]>();
    for (const m of members) {
      if (!m.userId) continue;
      rolesOfUser.set(m.userId, [...(rolesOfUser.get(m.userId) ?? []), m.role]);
    }

    return {
      project,
      brief,
      policy,
      constraints,
      investigations,
      hasPreferredScenario: Boolean(preferredScenario),
      consentCount,
      appointments,
      activityCount,
      deliverables,
      members,
      briefInputRoles: new Set(briefComments.flatMap((c) => rolesOfUser.get(c.authorId) ?? [])),
      advice,
      attendedRoles: new Set(attendance.map((a) => a.projectMember.role)),
      informationRoles: new Set(informationItems.flatMap((i) => (i.responsible ? [i.responsible.role] : []))),
      sharedRoles: new Set(transmittals.flatMap((t) => (t.fromMember ? [t.fromMember.role] : []))),
      constraintRoles: new Set(constraints.flatMap((c) => (c.raisedBy ? [c.raisedBy.role] : []))),
      investigationRoles: new Set(investigations.flatMap((i) => (i.recommendedBy ? [i.recommendedBy.role] : []))),
      serviceRoles: new Set(requiredServices.flatMap((s) => (s.recommendedBy ? [s.recommendedBy.role] : []))),
      criterionRoles: new Set(criteria.flatMap((c) => (c.raisedBy ? [c.raisedBy.role] : []))),
      manualChecks,
    };
  }

  /** Whether a Stage 1 document has enough in it to be put to the client. */
  ready(state: InceptionState, key: DeliverableKey): boolean {
    switch (key) {
      case 'BRIEF':
        return Boolean(state.brief && present(state.brief.clientRequirements) && present(state.brief.objectives) && present(state.brief.constraints));
      case 'SITE_ASSESSMENT':
        return state.constraints.length > 0 && state.investigations.length > 0;
      case 'DESKTOP_VIABILITY':
        return state.hasPreferredScenario;
      case 'PROCUREMENT_POLICY':
        return Boolean(state.policy?.deliveryStrategy && state.policy.tenderMethod && state.project?.contractForm);
      case 'CONSENTS_SCHEDULE':
        return state.consentCount > 0;
      case 'PROFESSIONAL_TEAM':
        return state.appointments.length > 0 && state.appointments.every((a) => present(a.scopeOfWork) && present(a.rolesAndResponsibilities));
      case 'INITIATION_PROGRAMME':
        return state.activityCount > 0;
    }
  }

  deliverableStatus(state: InceptionState, key: DeliverableKey) {
    return state.deliverables.find((d) => d.key === key)?.status ?? 'DRAFT';
  }

  responsibilities(state: InceptionState) {
    return PROCSA_STAGE1_ROLES.map((role) => ({
      key: role.key,
      label: role.label,
      members: state.members.filter((m) => role.memberRoles.includes(m.role)).map((m) => m.id),
      items: role.items.map((item) => this.evaluate(state, role, item.code, item.text, item.evidence)),
    }));
  }

  private evaluate(state: InceptionState, role: ProcsaRole, code: string, text: string, evidence: Evidence): ResponsibilityStatus {
    const manual = state.manualChecks.find((c) => c.roleKey === role.key && c.code === code);
    const auto = this.autoEvidence(state, role, evidence);
    return {
      code,
      text,
      evidenceRule: evidence,
      done: Boolean(auto) || Boolean(manual),
      source: auto ? 'auto' : manual ? 'manual' : null,
      evidence: auto,
      manualCheck: manual ? { doneBy: manual.doneBy.fullName, doneAt: manual.doneAt, note: manual.note } : null,
    };
  }

  /** Returns a short description of what proves the item done, or null. */
  private autoEvidence(state: InceptionState, role: ProcsaRole, evidence: Evidence): string | null {
    const isRole = (r: ProjectMemberRole | null | undefined) => Boolean(r && role.memberRoles.includes(r));
    const anyOf = (set: Set<ProjectMemberRole>) => [...set].some(isRole);
    const own = state.appointments.filter((a) => a.role === role.appointmentRole);
    const titleOf = (key: DeliverableKey) => INCEPTION_DELIVERABLES.find((d) => d.key === key)!.title;

    switch (evidence.kind) {
      case 'manual':
        return null;
      case 'deliverableReady':
        return this.ready(state, evidence.key) ? `${titleOf(evidence.key)} prepared` : null;
      case 'deliverableApproved':
        return this.deliverableStatus(state, evidence.key) === 'APPROVED' ? `${titleOf(evidence.key)} approved by the client` : null;
      case 'allDeliverablesApproved':
        return INCEPTION_DELIVERABLES.every((d) => this.deliverableStatus(state, d.key) === 'APPROVED') ? 'All Stage 1 documents approved by the client' : null;
      case 'consultantsAppointed':
        return state.appointments.length > 0 ? `${state.appointments.length} consultant appointment(s)` : null;
      case 'appointmentRolesDefined':
        return state.appointments.length > 0 && state.appointments.every((a) => present(a.rolesAndResponsibilities))
          ? 'Roles and responsibilities defined for every appointment'
          : null;
      case 'allAppointmentScopes':
        return state.appointments.length > 0 && state.appointments.every((a) => present(a.scopeOfWork)) ? 'Scope of services defined for every appointment' : null;
      case 'siteConstraintsLogged':
        return state.constraints.length > 0 ? `${state.constraints.length} site characteristic(s) / constraint(s) logged` : null;
      case 'briefInput':
        return anyOf(state.briefInputRoles) ? 'Contributed to the project brief' : null;
      case 'attendedInitiationMeeting':
        return anyOf(state.attendedRoles) ? 'Marked present at an initiation meeting' : null;
      case 'advice': {
        if (state.advice.some((a) => a.topic === evidence.topic && isRole(a.authorRole))) return 'Advice recorded';
        if (evidence.orConstraintRaised && anyOf(state.constraintRoles)) return 'Raised site constraints';
        if (evidence.orInvestigationRecommended && anyOf(state.investigationRoles)) return 'Recommended surveys / investigations';
        if (evidence.orServiceRecommended && anyOf(state.serviceRoles)) return 'Recommended required services';
        if (evidence.orCriterionRaised && anyOf(state.criterionRoles)) return 'Set financial design criteria';
        return null;
      }
      case 'ownScope':
        return own.some((a) => present(a.scopeOfWork)) ? `Scope of services defined (${own[0].contractor.name})` : null;
      case 'ownAgreementSigned': {
        const signed = own.find((a) => a.agreementStatus === 'SIGNED');
        return signed ? `Agreement signed (${signed.contractor.name})` : null;
      }
      case 'informationOwned':
        return anyOf(state.informationRoles) ? 'Responsible for information register items' : null;
      case 'informationShared':
        return anyOf(state.sharedRoles) ? 'Issued a transmittal to the team' : null;
    }
  }
}
