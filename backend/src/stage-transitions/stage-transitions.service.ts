import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { STAGE_LABEL } from '../reports/report-data.js';
import { DeliverablesService } from '../inception/deliverables.service.js';
import { MILESTONE_FOR_STAGE_EXIT, markMilestone } from '../opportunities/milestones.js';
import type { ProjectStage } from '../generated/prisma/enums.js';
import type { RequestTransitionDto } from './dto/request-transition.dto.js';
import type { DecideTransitionDto } from './dto/decide-transition.dto.js';
import { SignoffService, type RequestMeta } from '../signoff/signoff.service.js';
import { OUTCOME_LABEL, isApproval, resolveOutcome, responseDue } from '../signoff/dto/decision.dto.js';

// Mirrors frontend/src/lib/projectStages.ts's PROJECT_STAGES order - the
// fixed sequence a stage-gate request can only move one step forward
// along. Kept in sync by convention (like ProjectRisksPanel's severity
// thresholds), not a shared import, since the two apps don't share code.
const STAGE_ORDER: ProjectStage[] = [
  'INITIATION',
  'INCEPTION',
  'CONCEPT',
  'DESIGN',
  'DOCUMENTATION_PROCUREMENT',
  'CONSTRUCTION',
  'CLOSEOUT',
];

const TRANSITION_INCLUDE = {
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class StageTransitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
    private readonly deliverables: DeliverablesService,
    private readonly signoff: SignoffService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.stageTransition.findMany({
      where: { projectId },
      include: TRANSITION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** PROCSA PM 1.9: leaving Inception needs the client's approval of every
   * Stage 1 document. Other stages have no document set defined yet. */
  private async assertStageDocumentsApproved(projectId: string, fromStage: ProjectStage) {
    if (fromStage !== 'INCEPTION') return;
    const outstanding = await this.deliverables.outstanding(projectId);
    if (outstanding.length) {
      throw new BadRequestException(`The client must approve all Stage 1 documents first. Outstanding: ${outstanding.join('; ')}`);
    }
  }

  private nextStage(current: ProjectStage): ProjectStage | null {
    const idx = STAGE_ORDER.indexOf(current);
    return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  }

  async requestTransition(projectId: string, requestedById: string, dto: RequestTransitionDto) {
    const project = await this.projectsService.findOneForOwner(projectId, requestedById);
    if (project.closureType) throw new BadRequestException('This project is closed');

    const required = this.nextStage(project.stage);
    if (!required) throw new BadRequestException('This project is already at its final stage');
    if (dto.toStage !== required) {
      throw new BadRequestException(`The next stage must be requested in order - expected ${required}`);
    }

    const pending = await this.prisma.stageTransition.findFirst({ where: { projectId, status: 'PENDING' } });
    if (pending) throw new BadRequestException('A stage transition is already pending for this project');
    await this.assertStageDocumentsApproved(projectId, project.stage);

    const transition = await this.prisma.stageTransition.create({
      data: {
        projectId,
        fromStage: project.stage,
        toStage: dto.toStage,
        requestedById,
        requestComment: dto.comment,
        responseDueAt: responseDue(dto.responseDueAt),
      },
      include: TRANSITION_INCLUDE,
    });

    await this.askClientToSign(projectId, transition.id, project.name, project.stage, dto.toStage, transition.responseDueAt);

    return transition;
  }

  /** Asks the client to sign off the move, in the platform and by email
   * (7 Nov 2026): the client signs in to find a floating reminder. */
  private async askClientToSign(projectId: string, transitionId: string, projectName: string, fromStage: ProjectStage, toStage: ProjectStage, dueAt: Date | null, intro?: string) {
    const due = dueAt ? ` Please respond by ${dueAt.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric' })}.` : '';
    await this.notifications.notifyByEmailToo(
      await this.notifications.clientsOf(projectId),
      {
        projectId,
        type: intro ? 'STAGE_ADVANCED_BY_SETJEKA' : 'STAGE_TRANSITION_REQUESTED',
        entityType: 'STAGE_TRANSITION',
        entityId: transitionId,
        message: intro
          ? `${projectName}: Setjeka has moved on to ${STAGE_LABEL[toStage]}; your sign-off is still needed`
          : `${projectName}: please sign off the move from ${STAGE_LABEL[fromStage]} to ${STAGE_LABEL[toStage]}`,
        link: `/projects/${projectId}?tab=overview`,
      },
      {
        subject: `${projectName}: your sign-off is needed to move to ${STAGE_LABEL[toStage]}`,
        paragraphs: [
          ...(intro ? [intro] : []),
          `Setjeka asks you to sign off ${projectName} moving from ${STAGE_LABEL[fromStage]} to ${STAGE_LABEL[toStage]}.${due}`,
          'Sign in to the Setjeka platform, review the request, and approve it (with or without comments) or reject it. You sign by typing your name and adding your signature; the signed certificate, with a QR code to confirm it, is filed with the project documents.',
        ],
        action: { label: 'Review and sign', path: `/portal/projects/${projectId}#approvals` },
      },
    );
  }

  private async isSetjeka(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, fullName: true } });
    return { internal: u?.role === 'ADMIN' || u?.accountType === 'INTERNAL', fullName: u?.fullName ?? '' };
  }

  /** The client's sign-off of a stage move (7 Nov 2026). Setjeka's own
   * people don't decide here: they request the move, or advance without
   * waiting, with a reason (advance()). The client can sign while the
   * request is pending, which moves the project on, or after Setjeka has
   * advanced, which completes the record. */
  async decide(projectId: string, decidedById: string, id: string, dto: DecideTransitionDto, meta: RequestMeta = {}) {
    await this.projectsService.findOneForOwner(projectId, decidedById);
    const transition = await this.prisma.stageTransition.findFirst({ where: { id, projectId } });
    if (!transition) throw new NotFoundException('Stage transition not found');
    if ((await this.isSetjeka(decidedById)).internal) {
      throw new ForbiddenException(`The client signs off stage moves. To move on without waiting for the client, use "Advance without the client's sign-off" and give a reason.`);
    }
    if (transition.requestedById === decidedById) throw new ForbiddenException('You cannot approve your own request');
    const awaitingClient = transition.status === 'PENDING' || (transition.status === 'ADVANCED_BY_SETJEKA' && !transition.decidedAt);
    if (!awaitingClient) throw new BadRequestException('This transition has already been decided');
    const { outcome, comment } = resolveOutcome(dto);
    const approve = isApproval(outcome);
    const alreadyMoved = transition.status === 'ADVANCED_BY_SETJEKA';

    // Re-checked at decision time: a document may have been edited (and so
    // reopened) after the request was made.
    if (approve && !alreadyMoved) await this.assertStageDocumentsApproved(projectId, transition.fromStage);

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } });
    const facts: [string, string][] = [
      ['From stage', STAGE_LABEL[transition.fromStage]],
      ['To stage', STAGE_LABEL[transition.toStage]],
      ['Requested', `${transition.createdAt.toLocaleDateString('en-ZA')}${transition.requestComment ? ` - ${transition.requestComment}` : ''}`],
    ];
    if (alreadyMoved) facts.push(['Advanced by Setjeka', `${transition.overriddenAt?.toLocaleDateString('en-ZA') ?? ''} by ${transition.overriddenByName ?? 'Setjeka'}: ${transition.overrideReason ?? ''}`]);
    const record = await this.signoff.sign({
      projectId,
      subject: 'STAGE_TRANSITION',
      subjectId: id,
      title: `${project.name}: advance from ${STAGE_LABEL[transition.fromStage]} to ${STAGE_LABEL[transition.toStage]}`,
      kind: 'Stage gate sign-off',
      outcome,
      comment,
      signature: dto.signature,
      signedName: dto.signedName,
      requireName: true,
      signerId: decidedById,
      meta,
      facts,
    });

    const status = alreadyMoved ? 'ADVANCED_BY_SETJEKA' : approve ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction([
      this.prisma.stageTransition.update({
        where: { id },
        data: { status, decidedById, decisionComment: comment, decisionOutcome: outcome, decidedAt: new Date() },
      }),
      ...(approve && !alreadyMoved ? [this.prisma.project.update({ where: { id: projectId }, data: { stage: transition.toStage } })] : []),
    ]);
    // Leaving a stage completes it on the development milestones (DEV R12).
    const milestoneKey = MILESTONE_FOR_STAGE_EXIT[transition.fromStage];
    if (approve && !alreadyMoved && milestoneKey) await markMilestone(this.prisma, { projectId }, milestoneKey);

    await this.signoff.fileInDocuments(record.id, ['Sign-offs and certificates', 'Stage gates'], `Stage gate sign-off - ${STAGE_LABEL[transition.toStage]} - ${OUTCOME_LABEL[outcome]}`);

    const team = await this.notifications.setjekaTeamOf(projectId);
    const requester = await this.prisma.user.findUnique({ where: { id: transition.requestedById }, select: { id: true, email: true, fullName: true } });
    const people = [...new Map([...team, ...(requester ? [requester] : [])].map((p) => [p.id, p])).values()];
    const verdict = OUTCOME_LABEL[outcome].toLowerCase();
    const after = alreadyMoved
      ? approve
        ? `Setjeka had already advanced the project; the client's sign-off is now on record.`
        : 'Setjeka had already advanced the project. The client has not accepted the move: please follow up with them.'
      : approve
        ? `The project is now at ${STAGE_LABEL[transition.toStage]}.`
        : 'The project stays at its current stage.';
    await this.notifications.notifyByEmailToo(
      people,
      {
        projectId,
        type: 'STAGE_TRANSITION_DECIDED',
        entityType: 'STAGE_TRANSITION',
        entityId: id,
        message: `${project.name}: the client ${verdict} the move to ${STAGE_LABEL[transition.toStage]}${comment ? ` - ${comment}` : ''}`,
        link: `/projects/${projectId}?tab=overview`,
      },
      {
        subject: `${project.name}: the client ${verdict} the move to ${STAGE_LABEL[transition.toStage]}`,
        paragraphs: [
          `The client (${record.signerName}) has ${verdict} the move from ${STAGE_LABEL[transition.fromStage]} to ${STAGE_LABEL[transition.toStage]}.`,
          ...(comment ? [`Comments: ${comment}`] : []),
          after,
          'The signed certificate is filed under Documents > Sign-offs and certificates > Stage gates.',
        ],
        action: { label: 'Open the project', path: `/projects/${projectId}?tab=overview` },
      },
    );

    return this.prisma.stageTransition.findFirst({ where: { id }, include: TRANSITION_INCLUDE });
  }

  /** Setjeka moves the project on without waiting for the client (7 Nov
   * 2026: a client can be slow to sign, and the work can't wait). A reason
   * is required and kept on the record; the client is told, and their
   * sign-off is still asked for. */
  async advance(projectId: string, userId: string, id: string, reason: string) {
    const project = await this.projectsService.findOneForOwner(projectId, userId);
    const me = await this.isSetjeka(userId);
    if (!me.internal) throw new ForbiddenException(`Only Setjeka can advance a project without the client's sign-off`);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException(`Give the reason for advancing without the client's sign-off`);
    const transition = await this.prisma.stageTransition.findFirst({ where: { id, projectId } });
    if (!transition) throw new NotFoundException('Stage transition not found');
    if (transition.status !== 'PENDING') throw new BadRequestException('This request has already been decided');
    if (project.stage !== transition.fromStage) throw new BadRequestException('The project is no longer at the stage this request was made from');

    await this.prisma.$transaction([
      this.prisma.stageTransition.update({
        where: { id },
        data: { status: 'ADVANCED_BY_SETJEKA', overriddenById: userId, overriddenByName: me.fullName, overrideReason: why, overriddenAt: new Date() },
      }),
      this.prisma.project.update({ where: { id: projectId }, data: { stage: transition.toStage } }),
    ]);
    const milestoneKey = MILESTONE_FOR_STAGE_EXIT[transition.fromStage];
    if (milestoneKey) await markMilestone(this.prisma, { projectId }, milestoneKey);
    await this.audit.log({ userId, action: 'APPROVE', module: 'STAGE_GATE', entityType: 'STAGE_TRANSITION', entityId: id, projectId });

    await this.askClientToSign(
      projectId,
      id,
      project.name,
      transition.fromStage,
      transition.toStage,
      transition.responseDueAt,
      `Setjeka has moved ${project.name} on to ${STAGE_LABEL[transition.toStage]} so the work can continue. Reason given: ${why}`,
    );
    return this.prisma.stageTransition.findFirst({ where: { id }, include: TRANSITION_INCLUDE });
  }
}
