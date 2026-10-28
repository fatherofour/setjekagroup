import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
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
    private readonly permissionsService: PermissionsService,
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

    await this.notifyApprovers(projectId, requestedById, transition.id, project.name, project.stage, dto.toStage);

    return transition;
  }

  // Fans out to whoever currently holds STAGE_GATE/APPROVE on this
  // project - the same permission engine used to enforce the route
  // itself, so this automatically follows whatever the Administration
  // permission matrix (or a per-member override) says, with no separate
  // "who approves" configuration to keep in sync.
  private async notifyApprovers(
    projectId: string,
    requestedById: string,
    transitionId: string,
    projectName: string,
    fromStage: ProjectStage,
    toStage: ProjectStage,
  ) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null } },
      include: { user: { select: { id: true, role: true, accountType: true } } },
    });
    for (const member of members) {
      if (!member.user || member.user.id === requestedById) continue;
      const allowed = await this.permissionsService.can(
        member.user.role,
        member.user.accountType,
        member.user.id,
        projectId,
        'STAGE_GATE',
        'APPROVE',
      );
      if (!allowed) continue;
      await this.notifications.notify({
        userId: member.user.id,
        projectId,
        type: 'STAGE_TRANSITION_REQUESTED',
        entityType: 'STAGE_TRANSITION',
        entityId: transitionId,
        message: `${projectName}: a request to advance from ${fromStage} to ${toStage} needs your decision`,
      });
    }
  }

  async decide(projectId: string, decidedById: string, id: string, dto: DecideTransitionDto, meta: RequestMeta = {}) {
    await this.projectsService.findOneForOwner(projectId, decidedById);
    const transition = await this.prisma.stageTransition.findFirst({ where: { id, projectId } });
    if (!transition) throw new NotFoundException('Stage transition not found');
    if (transition.status !== 'PENDING') throw new BadRequestException('This transition has already been decided');
    const { outcome, comment } = resolveOutcome(dto);
    const approve = isApproval(outcome);

    // Re-checked at decision time: a document may have been edited (and so
    // reopened) after the request was made.
    if (approve) await this.assertStageDocumentsApproved(projectId, transition.fromStage);

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } });
    await this.signoff.sign({
      projectId,
      subject: 'STAGE_TRANSITION',
      subjectId: id,
      title: `${project.name}: advance from ${transition.fromStage} to ${transition.toStage}`,
      kind: 'Stage gate',
      outcome,
      comment,
      signature: dto.signature,
      signerId: decidedById,
      meta,
      facts: [
        ['From stage', transition.fromStage],
        ['To stage', transition.toStage],
        ['Requested', `${transition.createdAt.toLocaleDateString('en-ZA')}${transition.requestComment ? ` - ${transition.requestComment}` : ''}`],
      ],
    });

    const status = approve ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction([
      this.prisma.stageTransition.update({
        where: { id },
        data: { status, decidedById, decisionComment: comment, decisionOutcome: outcome, decidedAt: new Date() },
      }),
      ...(approve ? [this.prisma.project.update({ where: { id: projectId }, data: { stage: transition.toStage } })] : []),
    ]);
    // Leaving a stage completes it on the development milestones (DEV R12).
    const milestoneKey = MILESTONE_FOR_STAGE_EXIT[transition.fromStage];
    if (approve && milestoneKey) await markMilestone(this.prisma, { projectId }, milestoneKey);

    await this.notifications.notify({
      userId: transition.requestedById,
      projectId,
      type: 'STAGE_TRANSITION_DECIDED',
      entityType: 'STAGE_TRANSITION',
      entityId: id,
      message: `Advancing to ${transition.toStage}: ${OUTCOME_LABEL[outcome].toLowerCase()}${comment ? ` - ${comment}` : ''}`,
    });

    return this.prisma.stageTransition.findFirst({ where: { id }, include: TRANSITION_INCLUDE });
  }
}
