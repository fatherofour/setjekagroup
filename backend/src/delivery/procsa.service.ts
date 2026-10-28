import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { InceptionService } from '../inception/inception.service.js';
import { OpportunitiesService } from '../opportunities/opportunities.service.js';
import type { ProjectMemberRole, ProjectStage } from '../generated/prisma/enums.js';
import { DELIVERY_STAGES, findDeliveryItem, type DeliveryEvidence, type DeliveryRole } from './procsa-delivery.js';
import { REGISTER_BY_KEY } from './registers.js';

const HS_RE = /health\s*(and|&)\s*safety|h\s*&\s*s\b|\bshe\b/i;

/** What's on file for a project, loaded once per request and read by every
 * evidence rule. */
async function loadFacts(prisma: PrismaService, projectId: string) {
  const [
    entries,
    meetings,
    documents,
    transmittals,
    revisions,
    clientApprovals,
    records,
    transitions,
    consents,
    appointments,
    hseMembers,
    rfqs,
    pos,
    budget,
    finalEstimates,
    variations,
    policy,
    activities,
    baselines,
    submittals,
    rfis,
    reports,
    paidInvoices,
    drawingRevisions,
    plannedDrawings,
    drawingTransmittals,
    communications,
    inspections,
    consentEvents,
    attendance,
    memberTransmittals,
    registerReviews,
    punchItems,
  ] = await Promise.all([
    prisma.projectRegisterEntry.findMany({ where: { projectId }, select: { id: true, register: true, category: true, status: true } }),
    prisma.meeting.findMany({ where: { projectId, status: { not: 'CANCELLED' } }, select: { meetingType: true, status: true, minutesIssuedAt: true } }),
    prisma.projectDocument.findMany({ where: { deletedAt: null, projectId }, select: { name: true, documentType: true, description: true } }),
    prisma.transmittal.count({ where: { projectId, status: 'ISSUED' } }),
    prisma.documentRevision.findMany({ where: { document: { projectId, deletedAt: null }, reviewStatus: { not: 'PENDING' } }, select: { reviewStatus: true } }),
    prisma.documentApprovalRequest.findMany({ where: { projectId, status: { not: 'WITHDRAWN' } }, select: { outcome: true } }),
    prisma.approvalRecord.count({ where: { projectId } }),
    prisma.stageTransition.findMany({ where: { projectId, status: 'APPROVED' }, select: { fromStage: true } }),
    prisma.consentApproval.findMany({ where: { projectId }, select: { status: true } }),
    prisma.organisationProjectAppointment.findMany({
      where: { projectId, appointmentStatus: { in: ['APPOINTED', 'ACTIVE', 'COMPLETED'] } },
      select: { role: true, appointmentType: true, rolesAndResponsibilities: true },
    }),
    prisma.projectMember.count({ where: { projectId, role: 'HSE_MANAGER' } }),
    prisma.rfq.findMany({ where: { projectId }, select: { status: true, documentId: true, _count: { select: { items: true } } } }),
    prisma.purchaseOrder.count({ where: { projectId, status: { in: ['APPROVED', 'ISSUED'] } } }),
    prisma.projectBudget.findUnique({ where: { projectId }, select: { lockedAt: true } }),
    prisma.estimate.count({ where: { projectId, status: 'FINAL' } }),
    prisma.variation.findMany({ where: { projectId, status: { not: 'WITHDRAWN' } }, select: { status: true } }),
    prisma.procurementPolicy.findUnique({ where: { projectId }, select: { deliveryStrategy: true } }),
    prisma.scheduleActivity.findMany({ where: { projectId }, select: { name: true, contractorId: true, percentComplete: true } }),
    prisma.scheduleBaseline.count({ where: { projectId } }),
    prisma.submittal.findMany({ where: { projectId, status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISE_AND_RESUBMIT', 'REJECTED'] } }, select: { reviewerId: true } }),
    prisma.rfi.findMany({ where: { projectId, status: { in: ['ANSWERED', 'CLOSED'] } }, select: { assignedToId: true } }),
    prisma.projectReport.findMany({ where: { projectId }, select: { kind: true } }),
    prisma.supplierInvoice.count({ where: { projectId, status: 'PAID' } }),
    prisma.documentRevision.findMany({ where: { document: { projectId, drawingKey: { not: null } } }, select: { purpose: true, uploadedById: true } }),
    prisma.plannedDrawing.count({ where: { projectId } }),
    prisma.transmittalItem.count({ where: { transmittal: { projectId, status: 'ISSUED' }, documentRevision: { document: { drawingKey: { not: null } } } } }),
    prisma.projectCommunication.findMany({ where: { projectId, status: { in: ['AWAITING_ISSUE', 'ISSUED', 'RESPONDED', 'CLOSED'] } }, select: { kind: true, status: true, authorId: true } }),
    prisma.siteInspection.findMany({ where: { projectId, status: 'COMPLETED' }, select: { kind: true, inspectorId: true, completedById: true } }),
    prisma.consentEvent.findMany({ where: { consent: { projectId } }, select: { kind: true, consent: { select: { category: true, title: true } } } }),
    prisma.meetingAttendee.findMany({ where: { meeting: { projectId, status: { not: 'CANCELLED' } }, present: true }, select: { projectMemberId: true, meeting: { select: { meetingType: true } } } }),
    prisma.transmittal.findMany({ where: { projectId, status: 'ISSUED' }, select: { fromMemberId: true } }),
    prisma.approvalRecord.findMany({ where: { projectId, subject: 'REGISTER_ENTRY' }, select: { subjectId: true, signerId: true } }),
    prisma.punchItem.findMany({ where: { projectId }, select: { status: true, raisedById: true, closedById: true } }),
  ]);
  return {
    entries,
    meetings,
    docText: documents.map((d) => `${d.name} ${d.documentType ?? ''} ${d.description ?? ''}`),
    transmittals,
    revisions,
    clientApprovals,
    records,
    approvedFrom: new Set(transitions.map((t) => t.fromStage)),
    consents,
    appointments,
    hse: hseMembers > 0 || appointments.some((a) => HS_RE.test(`${a.appointmentType ?? ''} ${a.rolesAndResponsibilities ?? ''}`)),
    rfqs,
    pos,
    budgetLocked: Boolean(budget?.lockedAt),
    finalEstimates,
    variations,
    policy: Boolean(policy?.deliveryStrategy),
    activities,
    baselines,
    submittals,
    rfis,
    reports: reports.map((r) => r.kind as string),
    paidInvoices,
    drawingRevisions,
    plannedDrawings,
    drawingTransmittals,
    communications,
    inspections,
    consentEvents,
    attendance,
    memberTransmittals,
    registerReviews,
    punchItems,
  };
}

/** The people holding a role on the project, for evidence that has to be
 * the role-holder's own doing. */
interface RoleHolders {
  memberIds: Set<string>;
  userIds: Set<string>;
}

type Facts = Awaited<ReturnType<typeof loadFacts>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A short description of what proves the item done, or null. */
function evidenceFor(f: Facts, e: DeliveryEvidence, who: RoleHolders | null = null): string | null {
  const mine = (userId: string | null | undefined) => !who || (userId ? who.userIds.has(userId) : false);
  switch (e.kind) {
    case 'manual':
      return null;
    case 'register': {
      const r = REGISTER_BY_KEY.get(e.register);
      const rows = f.entries.filter((x) => x.register === e.register && (!e.category || e.category.includes(x.category ?? '')) && (!e.status || e.status.includes(x.status ?? '')));
      return rows.length >= (e.min ?? 1) ? `${plural(rows.length, 'entry', 'entries')} in ${r?.label ?? e.register}` : null;
    }
    case 'registerAllDone': {
      const rows = f.entries.filter((x) => x.register === e.register && e.category.includes(x.category ?? ''));
      return rows.length > 0 && rows.every((x) => e.doneStatus.includes(x.status ?? '')) ? `All ${plural(rows.length, 'item')} closed` : null;
    }
    case 'meetings': {
      const rows = f.meetings.filter((m) => e.types.includes(m.meetingType) && (e.minutes ? Boolean(m.minutesIssuedAt) : m.status === 'HELD' || Boolean(m.minutesIssuedAt)));
      return rows.length ? `${plural(rows.length, 'meeting')}${e.minutes ? ' with minutes issued' : ' held'}` : null;
    }
    case 'document': {
      const hit = f.docText.find((t) => e.match.test(t));
      return hit ? `Document on file: ${hit.trim().slice(0, 80)}` : null;
    }
    case 'stageApproved':
      return f.approvedFrom.has(e.from) ? 'Stage move approved by the client' : null;
    case 'consents': {
      const n = f.consents.filter((c) => e.status.includes(c.status)).length;
      return n ? `${plural(n, 'consent')} ${e.status.includes('SUBMITTED') ? 'submitted or approved' : 'approved'}` : null;
    }
    case 'appointments': {
      const rows = f.appointments.filter((a) => !e.role || a.role === e.role);
      if (rows.length === 0) return null;
      if (e.rolesDefined && rows.some((a) => !a.rolesAndResponsibilities?.trim())) return null;
      return `${plural(rows.length, 'appointment')}${e.rolesDefined ? ', all with roles and responsibilities' : ''}`;
    }
    case 'hse':
      return f.hse ? 'Health and safety manager or consultant on the team' : null;
    case 'transmittals':
      return f.transmittals ? `${plural(f.transmittals, 'transmittal')} issued` : null;
    case 'revisionsReviewed': {
      const n = f.revisions.filter((r) => !e.approvedOnly || r.reviewStatus === 'APPROVED').length;
      return n ? `${plural(n, 'revision')} ${e.approvedOnly ? 'approved' : 'reviewed'}` : null;
    }
    case 'clientDocApprovals': {
      const n = f.clientApprovals.filter((r) => !e.approvedOnly || r.outcome === 'APPROVED' || r.outcome === 'APPROVED_WITH_COMMENTS').length;
      return n ? `${plural(n, 'document')} ${e.approvedOnly ? 'approved by the client' : 'sent to the client for approval'}` : null;
    }
    case 'decisions':
      return f.records ? `${plural(f.records, 'decision')} signed off` : null;
    case 'rfqs': {
      const n = f.rfqs.filter((r) => e.status.includes(r.status)).length;
      return n ? `${plural(n, 'RFQ')} ${e.status.length === 1 && e.status[0] === 'AWARDED' ? 'awarded' : 'issued'}` : null;
    }
    case 'rfqWithDocuments': {
      const n = f.rfqs.filter((r) => r.documentId || r._count.items > 0).length;
      return n ? `${plural(n, 'RFQ')} with tender documents` : null;
    }
    case 'posIssued':
      return f.pos ? `${plural(f.pos, 'order')} approved or issued` : null;
    case 'budgetLocked':
      return f.budgetLocked ? 'Budget locked as the approved baseline' : null;
    case 'estimateFinal':
      return f.finalEstimates ? `${plural(f.finalEstimates, 'final estimate')}` : null;
    case 'variations': {
      const n = f.variations.filter((v) => !e.decided || v.status === 'APPROVED' || v.status === 'REJECTED').length;
      return n ? `${plural(n, 'variation')} ${e.decided ? 'decided' : 'raised'}` : null;
    }
    case 'procurementPolicy':
      return f.policy ? 'Procurement policy and delivery strategy on file' : null;
    case 'schedule': {
      const beyond = f.activities.filter((a) => !a.name.startsWith('Stage 1 — '));
      if (e.beyondStage1 && beyond.length === 0) return null;
      if (e.baseline && f.baselines === 0) return null;
      if (e.contractor && !f.activities.some((a) => a.contractorId)) return null;
      if (e.progress && !f.activities.some((a) => a.percentComplete > 0)) return null;
      if (!e.beyondStage1 && !e.baseline && !e.contractor && !e.progress && f.activities.length === 0) return null;
      return [
        e.beyondStage1 && plural(beyond.length, 'programme activity', 'programme activities'),
        e.baseline && plural(f.baselines, 'baseline'),
        e.contractor && 'contractor activities on the programme',
        e.progress && 'progress recorded',
      ]
        .filter(Boolean)
        .join(', ');
    }
    case 'submittalsReviewed': {
      // byRole: reviewed by the role itself (the reviewer named on the submittal).
      const n = f.submittals.filter((x) => !e.byRole || !who || (x.reviewerId ? who.memberIds.has(x.reviewerId) : false)).length;
      return n ? `${plural(n, 'submittal')} reviewed` : null;
    }
    case 'rfisAnswered': {
      const n = f.rfis.filter((x) => !e.byRole || !who || (x.assignedToId ? who.memberIds.has(x.assignedToId) : false)).length;
      return n ? `${plural(n, 'RFI')} answered` : null;
    }
    case 'report': {
      const n = f.reports.filter((k) => e.kinds.includes(k as never)).length;
      return n ? `${plural(n, 'report')} generated` : null;
    }
    case 'paidInvoices':
      return f.paidInvoices ? `${plural(f.paidInvoices, 'supplier invoice')} paid` : null;
    case 'drawings': {
      const rows = f.drawingRevisions.filter((r) => (!e.purposes || (r.purpose && e.purposes.includes(r.purpose))) && (!e.byRole || mine(r.uploadedById)));
      return rows.length ? `${plural(rows.length, 'drawing revision')} ${e.purposes?.length === 1 ? `issued ${e.purposes[0].toLowerCase().replace(/_/g, ' ')}` : 'on the register'}` : null;
    }
    case 'docProgramme':
      return f.plannedDrawings ? `${plural(f.plannedDrawings, 'drawing')} on the documentation programme` : null;
    case 'drawingRegister':
      return f.drawingRevisions.length && f.drawingTransmittals ? `${plural(f.drawingTransmittals, 'drawing')} issued on transmittals` : null;
    case 'communications': {
      const rows = f.communications.filter((c) => e.kinds.includes(c.kind) && (!e.byRole || mine(c.authorId)) && (e.byRole || c.status !== 'AWAITING_ISSUE'));
      return rows.length ? `${plural(rows.length, e.kinds.length === 1 && e.kinds[0] === 'CONTRACT_INSTRUCTION' ? 'contract instruction' : 'letter or instruction')}${e.byRole ? ' from the architect' : ' issued'}` : null;
    }
    case 'inspections': {
      const rows = f.inspections.filter((i) => e.kinds.includes(i.kind) && (!e.byRole || (i.inspectorId ? who?.memberIds.has(i.inspectorId) : false) || mine(i.completedById)));
      return rows.length ? `${plural(rows.length, 'inspection')} completed` : null;
    }
    case 'consentRounds': {
      const rows = f.consentEvents.filter((c) => e.events.includes(c.kind) && (!e.category || e.category.test(`${c.consent.category ?? ''} ${c.consent.title}`)));
      return rows.length ? `${plural(rows.length, 'round')} with the authority recorded` : null;
    }
    case 'meetingsAttended': {
      const rows = f.attendance.filter((a) => e.types.includes(a.meeting.meetingType) && (!who || who.memberIds.has(a.projectMemberId)));
      return rows.length ? `Present at ${plural(rows.length, 'meeting')}` : null;
    }
    case 'transmittalsByRole': {
      const n = f.memberTransmittals.filter((t) => !who || (t.fromMemberId ? who.memberIds.has(t.fromMemberId) : false)).length;
      return n ? `${plural(n, 'transmittal')} issued` : null;
    }
    case 'punchItems': {
      const rows = f.punchItems.filter((p) => (e.closed ? p.status === 'CLOSED' && mine(p.closedById) : mine(p.raisedById)));
      return rows.length ? `${plural(rows.length, 'punch item')} ${e.closed ? 'closed' : 'raised'}` : null;
    }
    case 'registerReviewed': {
      const entries = new Map(f.entries.map((x) => [x.id, x]));
      const rows = f.registerReviews.filter((v) => {
        const entry = entries.get(v.subjectId);
        return entry && entry.register === e.register && (!e.category || e.category.includes(entry.category ?? '')) && mine(v.signerId);
      });
      return rows.length ? `${plural(rows.length, 'review')} signed` : null;
    }
    case 'any': {
      for (const x of e.of) {
        const hit = evidenceFor(f, x, who);
        if (hit) return hit;
      }
      return null;
    }
    case 'all': {
      const hits = e.of.map((x) => evidenceFor(f, x, who));
      return hits.every(Boolean) ? hits.join('; ') : null;
    }
  }
}

export interface TrackerItem {
  code: string;
  text: string;
  done: boolean;
  source: 'auto' | 'manual' | null;
  evidence: string | null;
  tickedBy?: string;
  manualCheck: { doneBy: string; doneAt: Date; note: string | null } | null;
  go?: { tab: string; register?: string; label: string };
}

/** PROCSA for the Development Manager and Project Manager from Stage 0 to
 * close-out (the user's direction, 25 Oct 2026). Stage 0 comes from the
 * opportunity's own tracker, Stage 1 from Inception, and Stages 2 to 6 are
 * evaluated here from what's on the project. */
@Injectable()
export class ProcsaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly inception: InceptionService,
    private readonly opportunities: OpportunitiesService,
  ) {}

  /** Setjeka sees every role; an outside party sees the roles they hold. */
  private async viewer(projectId: string, userId: string) {
    const [user, roles] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } }),
    ]);
    return { internal: user?.role === 'ADMIN' || user?.accountType === 'INTERNAL', roles: roles.map((r) => r.role) };
  }

  async tracker(projectId: string, userId: string) {
    const project = await this.projects.findOneForOwner(projectId, userId);
    const me = await this.viewer(projectId, userId);
    const roleKeys = DELIVERY_STAGES[0].roles.map((r) => r.key);
    const memberRolesOf = (key: string): ProjectMemberRole[] => DELIVERY_STAGES.flatMap((s) => s.roles).find((r) => r.key === key)?.memberRoles ?? [];
    const visible = (key: string) => me.internal || memberRolesOf(key).some((r) => me.roles.includes(r));
    const [facts, checks, members, stage1, opportunity] = await Promise.all([
      loadFacts(this.prisma, projectId),
      this.prisma.responsibilityCheck.findMany({ where: { projectId, stage: { not: 'INCEPTION' } }, include: { doneBy: { select: { fullName: true } } } }),
      this.prisma.projectMember.findMany({
        where: { projectId, role: { in: [...new Set(roleKeys.flatMap((k) => memberRolesOf(k)))] } },
        select: { id: true, role: true, userId: true, externalName: true, user: { select: { fullName: true } } },
      }),
      this.inception.responsibilities(projectId),
      this.prisma.opportunity.findFirst({ where: { convertedProjectId: projectId }, select: { id: true, name: true } }),
    ]);

    const holders = (key: string) => members.filter((m) => memberRolesOf(key).includes(m.role));
    const people = (key: string) => holders(key).map((m) => m.user?.fullName ?? m.externalName ?? '—');
    const whoFor = (key: string): RoleHolders | null =>
      key === 'ARCHITECT' ? { memberIds: new Set(holders(key).map((m) => m.id)), userIds: new Set(holders(key).flatMap((m) => (m.userId ? [m.userId] : []))) } : null;
    const summarise = (items: TrackerItem[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

    // Stage 0, from the opportunity the project came from.
    let stage0: { opportunityId: string; opportunityName: string; roles: { key: string; label: string; items: TrackerItem[] }[] } | null = null;
    if (opportunity) {
      const o = await this.opportunities.findOne(opportunity.id);
      stage0 = {
        opportunityId: opportunity.id,
        opportunityName: opportunity.name,
        roles: o.readiness.roles
          .filter((r) => r.key === 'DEVELOPMENT_MANAGER' && (visible('DEVELOPMENT_MANAGER') || visible('PROJECT_MANAGER')))
          .map((r) => ({ key: r.key, label: r.label, items: r.items.map((i) => ({ code: i.code, text: i.text, done: i.done, source: i.source, evidence: i.evidence, manualCheck: i.manualCheck })) })),
      };
    }

    const stage1Roles = stage1
      .filter((r) => roleKeys.includes(r.key as never) && visible(r.key))
      .map((r) => ({
        key: r.key,
        label: r.label,
        people: people(r.key),
        items: r.items.map((i) => ({ code: i.code, text: i.text, done: i.done, source: i.source, evidence: i.evidence, manualCheck: i.manualCheck, go: { tab: 'inception', label: 'Inception (Stage 1)' } })),
      }));

    const later = DELIVERY_STAGES.map((s) => ({
      stage: s.stage,
      number: s.number,
      label: s.label,
      purpose: s.purpose,
      roles: s.roles.filter((role) => visible(role.key)).map((role: DeliveryRole) => ({
        key: role.key,
        label: role.label,
        people: people(role.key),
        items: role.items.map((item): TrackerItem => {
          const auto = evidenceFor(facts, item.evidence, whoFor(role.key));
          const manual = checks.find((c) => c.stage === s.stage && c.roleKey === role.key && c.code === item.code);
          return {
            code: item.code,
            text: item.text,
            done: Boolean(auto) || Boolean(manual),
            source: auto ? 'auto' : manual ? 'manual' : null,
            evidence: auto,
            tickedBy: item.tickedBy,
            manualCheck: manual ? { doneBy: manual.doneBy.fullName, doneAt: manual.doneAt, note: manual.note } : null,
            go: item.go,
          };
        }),
      })),
    }));

    const stages = [
      {
        stage: 'INITIATION' as ProjectStage,
        number: 0,
        label: 'Project Initiation & Briefing',
        purpose: 'Establish the need, desirability and viability of the development, and secure the land and the rights to develop it.',
        trackedOn: stage0 ? { kind: 'opportunity', id: stage0.opportunityId, name: stage0.opportunityName } : null,
        roles: (stage0?.roles ?? []).map((r) => ({ ...r, people: [...people('DEVELOPMENT_MANAGER'), ...people('PROJECT_MANAGER')] })),
      },
      {
        stage: 'INCEPTION' as ProjectStage,
        number: 1,
        label: 'Inception',
        purpose: 'Establish the client requirements and preferences, assess user needs and options, appoint the consultants and establish the project brief.',
        trackedOn: { kind: 'inception' },
        roles: stage1Roles,
      },
      ...later.map((s) => ({ ...s, trackedOn: null })),
    ].map((s) => {
      const items = s.roles.flatMap((r) => r.items as TrackerItem[]);
      return { ...s, ...summarise(items), roles: s.roles.map((r) => ({ ...r, ...summarise(r.items as TrackerItem[]) })) };
    });

    const all = stages.flatMap((s) => s.roles.flatMap((r) => r.items as TrackerItem[]));
    return { projectStage: project.stage, ...summarise(all), stages };
  }

  /** Sign an item off by hand (done off the platform), or undo that.
   * Setjeka staff, or the architect for the architect's own items. Stage 1
   * items are signed off on Inception. */
  async setCheck(projectId: string, userId: string, stage: string, roleKey: string, code: string, done: boolean, note?: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const me = await this.viewer(projectId, userId);
    const role = DELIVERY_STAGES.flatMap((s) => s.roles).find((r) => r.key === roleKey);
    const ownItem = roleKey === 'ARCHITECT' && Boolean(role?.memberRoles.some((r) => me.roles.includes(r)));
    if (!me.internal && !ownItem) throw new ForbiddenException('Only Setjeka staff, or the role-holder for their own items, sign off PROCSA responsibilities');
    const item = findDeliveryItem(stage, roleKey, code);
    if (!item) throw new NotFoundException('Unknown PROCSA responsibility');
    const st = stage as ProjectStage;
    if (done) {
      await this.prisma.responsibilityCheck.upsert({
        where: { projectId_stage_roleKey_code: { projectId, stage: st, roleKey, code } },
        update: { doneById: userId, note: note?.trim() || null, doneAt: new Date() },
        create: { projectId, stage: st, roleKey, code, doneById: userId, note: note?.trim() || null },
      });
    } else {
      await this.prisma.responsibilityCheck.deleteMany({ where: { projectId, stage: st, roleKey, code } });
    }
    return this.tracker(projectId, userId);
  }
}
