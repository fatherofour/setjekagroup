import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommercialService } from '../commercial/commercial.service.js';
import { INCEPTION_DELIVERABLES } from '../inception/procsa.js';
import { milestoneStatus } from '../opportunities/milestones.js';
import { STAGE_LABEL } from '../reports/report-data.js';

const PERSON = { select: { fullName: true } } as const;

/** Client portal for projects (register CLI; scope §4.9). The client sees
 * where the project stands: stage, programme, budget drawn, completion
 * date, what is waiting for their decision, documents Setjeka has shared,
 * meetings and notes. Everything is scoped to projects where the caller is
 * a CLIENT member, re-read on every request. Never fees, quotes or other
 * firms' commercial terms. */
@Injectable()
export class ClientProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commercial: CommercialService,
  ) {}

  private async clientMember(userId: string, projectId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, clientId: true, status: true } });
    if (!user?.clientId || user.accountType !== 'EXTERNAL' || user.status !== 'ACTIVE') throw new ForbiddenException('This account has no client portal access');
    if (!projectId) return null;
    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } });
    if (!member) throw new NotFoundException('Project not found');
    return member;
  }

  private async programme(projectId: string) {
    const acts = await this.prisma.scheduleActivity.findMany({
      where: { projectId },
      select: { id: true, name: true, activityType: true, startDate: true, endDate: true, durationDays: true, percentComplete: true, status: true, isCriticalPath: true },
      orderBy: { startDate: 'asc' },
    });
    if (!acts.length) return null;
    const tasks = acts.filter((a) => a.activityType === 'TASK');
    const weight = tasks.reduce((s, a) => s + Math.max(a.durationDays, 1), 0);
    const percent = weight ? Math.round(tasks.reduce((s, a) => s + Math.max(a.durationDays, 1) * a.percentComplete, 0) / weight) : 0;
    const now = Date.now();
    return {
      percent,
      start: acts[0].startDate,
      finish: acts.reduce((m, a) => (a.endDate > m ? a.endDate : m), acts[0].endDate),
      activities: acts.length,
      critical: acts.filter((a) => a.isCriticalPath).length,
      behind: tasks.filter((a) => a.endDate.getTime() < now && a.percentComplete < 100).length,
      upcoming: acts.filter((a) => a.percentComplete < 100).slice(0, 6),
    };
  }

  async projects(userId: string) {
    await this.clientMember(userId);
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, role: 'CLIENT' },
      select: { project: { select: { id: true, name: true, projectCode: true, stage: true, status: true, location: true, endDate: true, currency: true } } },
    });
    const out = [];
    for (const { project: p } of memberships) {
      const [docs, vos, gates, programme] = await Promise.all([
        this.prisma.stageDeliverable.count({ where: { projectId: p.id, status: 'SUBMITTED' } }),
        this.prisma.variation.count({ where: { projectId: p.id, status: 'SUBMITTED' } }),
        this.prisma.stageTransition.count({ where: { projectId: p.id, OR: [{ status: 'PENDING' }, { status: 'ADVANCED_BY_SETJEKA', decidedAt: null }] } }),
        this.programme(p.id),
      ]);
      const completions = await this.prisma.projectCompletion.count({ where: { projectId: p.id, status: 'PENDING' } });
      out.push({ ...p, waitingForYou: docs + vos + gates + completions, programmePercent: programme?.percent ?? null, completion: p.endDate ?? programme?.finish ?? null });
    }
    return out;
  }

  async project(userId: string, projectId: string) {
    await this.clientMember(userId, projectId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, name: true, projectCode: true, description: true, stage: true, status: true, location: true, latitude: true, longitude: true, startDate: true, endDate: true, value: true, currency: true, closureType: true, closureReason: true, closedAt: true },
    });

    const [transitions, deliverables, variations, milestones, documents, meetings, team, appointments, notes, programme] = await Promise.all([
      this.prisma.stageTransition.findMany({ where: { projectId }, include: { requestedBy: PERSON, decidedBy: PERSON }, orderBy: { createdAt: 'desc' } }),
      this.prisma.stageDeliverable.findMany({
        where: { projectId, stage: 'INCEPTION' },
        include: { submittedBy: PERSON, decidedBy: PERSON, events: { where: { type: { in: ['SUBMITTED', 'APPROVED', 'REVISION_REQUESTED'] } }, include: { actor: PERSON }, orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.variation.findMany({
        where: { projectId, status: { in: ['SUBMITTED', 'APPROVED', 'REJECTED'] } },
        include: { raisedBy: PERSON, decidedBy: PERSON },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.developmentMilestone.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.projectDocument.findMany({
        where: { deletedAt: null, projectId, clientVisible: true },
        select: {
          id: true,
          name: true,
          documentType: true,
          discipline: true,
          description: true,
          revisions: { orderBy: { uploadedAt: 'desc' }, take: 1, select: { id: true, revisionNumber: true, originalFilename: true, mimeType: true, uploadedAt: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.meeting.findMany({
        where: { projectId, status: { not: 'CANCELLED' }, attendees: { some: { projectMember: { userId } } } },
        select: { id: true, title: true, meetingType: true, scheduledAt: true, location: true, agenda: true, status: true, minutes: true, minutesIssuedAt: true },
        orderBy: { scheduledAt: 'desc' },
        take: 12,
      }),
      this.prisma.projectMember.findMany({
        where: { projectId, role: { in: ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'] } },
        select: { role: true, externalName: true, externalEmail: true, user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.organisationProjectAppointment.findMany({
        where: { projectId, appointmentStatus: { in: ['APPOINTED', 'ACTIVE'] } },
        select: { appointmentType: true, role: true, contractor: { select: { name: true } } },
      }),
      this.prisma.comment.findMany({
        where: { projectId, recipientId: userId },
        include: { author: PERSON },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.programme(projectId),
    ]);
    const [docApprovals, records, certificates] = await Promise.all([
      this.prisma.documentApprovalRequest.findMany({
        where: { projectId, status: { in: ['PENDING', 'DECIDED'] }, revision: { document: { clientVisible: true } } },
        include: { requestedBy: PERSON, decidedBy: PERSON, revision: { select: { id: true, revisionNumber: true, originalFilename: true, mimeType: true, document: { select: { id: true, name: true, documentType: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.approvalRecord.findMany({ where: { projectId }, select: { id: true, subject: true, subjectId: true, signedAt: true }, orderBy: { signedAt: 'desc' } }),
      // Payment certificates issued by Setjeka's PM, for the client to approve.
      this.prisma.valuation.findMany({
        where: { projectId, status: { in: ['CERTIFIED', 'APPROVED', 'REJECTED', 'PAID'] } },
        include: { contract: { select: { title: true, currency: true, contractor: { select: { name: true } } } }, certifiedBy: PERSON, decidedBy: PERSON },
        orderBy: { certifiedAt: 'desc' },
      }),
    ]);
    // The latest signed copy for each decided item.
    const recordFor = (subjectId: string) => records.find((r) => r.subjectId === subjectId)?.id ?? null;
    const OUTCOME: Record<string, string> = { APPROVED: 'Approved', APPROVED_WITH_COMMENTS: 'Approved with comments', REJECTED: 'Rejected', REJECTED_WITH_COMMENTS: 'Rejected with comments' };
    const outcomeOf = (o: string | null, fallback: string) => (o ? OUTCOME[o] : fallback);

    const summary = await this.commercial.summary(projectId).catch(() => null);
    const commercial =
      summary && (summary.totals.budget > 0 || summary.totals.committed > 0)
        ? {
            currency: summary.currency,
            budgetLocked: summary.budgetLocked,
            originalBudget: summary.totals.budget,
            approvedVariations: summary.totals.approvedVariations,
            revisedBudget: summary.totals.revisedBudget,
            committed: summary.totals.committed,
            paid: summary.totals.paid,
            forecastFinal: summary.totals.forecastFinal,
            variance: summary.totals.variance,
            contingencyRemaining: summary.contingency.remaining,
            drawnPercent: summary.totals.revisedBudget > 0 ? Math.round((summary.totals.paid / summary.totals.revisedBudget) * 100) : null,
          }
        : null;

    const title = (key: string) => INCEPTION_DELIVERABLES.find((d) => d.key === key)?.title ?? key;
    // Pending, or advanced by Setjeka with the client's sign-off still asked for.
    const pendingGate = transitions.find((t) => t.status === 'PENDING' || (t.status === 'ADVANCED_BY_SETJEKA' && !t.decidedAt)) ?? null;
    const pendingCompletion = await this.prisma.projectCompletion.findFirst({ where: { projectId, status: 'PENDING' } });

    // The client's recorded decisions: who decided, what, when.
    const decisions = [
      ...deliverables
        .filter((d) => d.decidedAt && d.decidedBy)
        .map((d) => ({ kind: 'Stage 1 document', title: `${title(d.key)} (v${d.version})`, outcome: outcomeOf(d.decisionOutcome, d.status === 'APPROVED' ? 'Approved' : 'Revision requested'), by: d.decidedBy!.fullName, at: d.decidedAt!, comment: d.decisionComment, recordId: recordFor(d.id) })),
      ...variations
        .filter((v) => v.decidedAt && v.decidedBy)
        .map((v) => ({ kind: 'Variation', title: `${v.number} ${v.title}`, outcome: outcomeOf(v.decisionOutcome, v.status === 'APPROVED' ? 'Approved' : 'Rejected'), by: v.decidedBy!.fullName, at: v.decidedAt!, comment: v.decisionComment, recordId: recordFor(v.id) })),
      ...certificates
        .filter((v) => v.decidedAt && v.decidedBy)
        .map((v) => ({ kind: 'Payment certificate', title: `${v.certificateNumber} ${v.contract.contractor.name}`, outcome: outcomeOf(v.decisionOutcome, v.status === 'REJECTED' ? 'Rejected' : 'Approved'), by: v.decidedBy!.fullName, at: v.decidedAt!, comment: v.decisionComment, recordId: recordFor(v.id) })),
      ...transitions
        .filter((t) => t.decidedAt && t.decidedBy)
        .map((t) => ({ kind: 'Stage gate', title: `${STAGE_LABEL[t.fromStage]} → ${STAGE_LABEL[t.toStage]}`, outcome: outcomeOf(t.decisionOutcome, t.status === 'APPROVED' ? 'Approved' : 'Rejected'), by: t.decidedBy!.fullName, at: t.decidedAt!, comment: t.decisionComment, recordId: recordFor(t.id) })),
      ...docApprovals
        .filter((r) => r.status === 'DECIDED' && r.decidedAt && r.decidedBy)
        .map((r) => ({ kind: 'Document', title: `${r.revision.document.name} (Rev ${r.revision.revisionNumber})`, outcome: outcomeOf(r.outcome, 'Decided'), by: r.decidedBy!.fullName, at: r.decidedAt!, comment: r.comment, recordId: recordFor(r.revisionId) })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 20);

    return {
      project,
      programme,
      commercial,
      milestones: milestones.map((m) => ({ id: m.id, name: m.name, baselineDate: m.baselineDate, targetDate: m.targetDate, actualDate: m.actualDate, ...milestoneStatus(m) })),
      approvals: {
        documents: deliverables
          .filter((d) => d.status === 'SUBMITTED')
          .map((d) => ({ id: d.id, key: d.key, title: title(d.key), version: d.version, submittedAt: d.submittedAt, submittedBy: d.submittedBy?.fullName ?? null, note: d.events[0]?.type === 'SUBMITTED' ? d.events[0].comment : null, dueAt: d.responseDueAt })),
        variations: variations
          .filter((v) => v.status === 'SUBMITTED')
          .map((v) => ({ id: v.id, number: v.number, title: v.title, description: v.description, reason: v.reason, value: v.assessedValue ?? v.estimatedValue, timeImpactDays: v.timeImpactDays, raisedBy: v.raisedBy.fullName, submittedAt: v.submittedAt, dueAt: v.responseDueAt })),
        certificates: certificates
          .filter((v) => v.status === 'CERTIFIED')
          .map((v) => ({
            id: v.id,
            certificateNumber: v.certificateNumber,
            contract: v.contract.title,
            contractor: v.contract.contractor.name,
            currency: v.contract.currency,
            valuationDate: v.valuationDate,
            grossValuation: v.grossValuation,
            retention: v.retention,
            previouslyCertified: v.previouslyCertified,
            netDue: v.netDue,
            vat: v.vat,
            amountDue: v.amountDue,
            isFinal: v.isFinal,
            certifiedBy: v.certifiedBy?.fullName ?? null,
            certifiedAt: v.certifiedAt,
            dueAt: v.responseDueAt,
          })),
        stageGate: pendingGate
          ? {
              id: pendingGate.id,
              fromStage: pendingGate.fromStage,
              toStage: pendingGate.toStage,
              comment: pendingGate.requestComment,
              requestedBy: pendingGate.requestedBy.fullName,
              requestedAt: pendingGate.createdAt,
              dueAt: pendingGate.responseDueAt,
              advancedBySetjeka: pendingGate.status === 'ADVANCED_BY_SETJEKA' ? { by: pendingGate.overriddenByName, at: pendingGate.overriddenAt, reason: pendingGate.overrideReason } : null,
            }
          : null,
        completion: pendingCompletion
          ? { id: pendingCompletion.id, completionDate: pendingCompletion.completionDate, message: pendingCompletion.message, issuedBy: pendingCompletion.issuedByName, issuedAt: pendingCompletion.createdAt, dueAt: pendingCompletion.responseDueAt }
          : null,
        drawings: docApprovals
          .filter((r) => r.status === 'PENDING')
          .map((r) => ({
            id: r.id,
            documentId: r.revision.document.id,
            revisionId: r.revision.id,
            name: r.revision.document.name,
            documentType: r.revision.document.documentType,
            revisionNumber: r.revision.revisionNumber,
            mimeType: r.revision.mimeType,
            originalFilename: r.revision.originalFilename,
            message: r.message,
            requestedBy: r.requestedBy.fullName,
            requestedAt: r.createdAt,
            dueAt: r.responseDueAt,
          })),
      },
      stageHistory: transitions.filter((t) => t.status === 'APPROVED' || t.status === 'ADVANCED_BY_SETJEKA').map((t) => ({ toStage: t.toStage, decidedAt: t.decidedAt })),
      decisions,
      documents: documents.map(({ revisions, ...d }) => ({ ...d, current: revisions[0] ?? null })),
      meetings,
      team: [
        ...team.map((m) => ({ name: m.user?.fullName ?? m.externalName ?? '—', role: m.role, email: m.user?.email ?? m.externalEmail ?? null })),
        ...appointments.map((a) => ({ name: a.contractor.name, role: a.appointmentType ?? a.role, email: null })),
      ],
      notes: notes.map((n) => ({ id: n.id, body: n.body, author: n.author.fullName, isAction: n.isAction, actionStatus: n.actionStatus, dueDate: n.dueDate, createdAt: n.createdAt, acknowledgedAt: n.acknowledgedAt, entityType: n.entityType })),
    };
  }
}
