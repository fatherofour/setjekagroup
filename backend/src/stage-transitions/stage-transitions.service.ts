import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { ProjectStage } from '../generated/prisma/enums.js';
import type { RequestTransitionDto } from './dto/request-transition.dto.js';
import type { DecideTransitionDto } from './dto/decide-transition.dto.js';

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
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.stageTransition.findMany({
      where: { projectId },
      include: TRANSITION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
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

    const transition = await this.prisma.stageTransition.create({
      data: {
        projectId,
        fromStage: project.stage,
        toStage: dto.toStage,
        requestedById,
        requestComment: dto.comment,
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

  async decide(projectId: string, decidedById: string, id: string, dto: DecideTransitionDto) {
    await this.projectsService.findOneForOwner(projectId, decidedById);
    const transition = await this.prisma.stageTransition.findFirst({ where: { id, projectId } });
    if (!transition) throw new NotFoundException('Stage transition not found');
    if (transition.status !== 'PENDING') throw new BadRequestException('This transition has already been decided');

    const status = dto.approve ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction([
      this.prisma.stageTransition.update({
        where: { id },
        data: { status, decidedById, decisionComment: dto.comment, decidedAt: new Date() },
      }),
      ...(dto.approve ? [this.prisma.project.update({ where: { id: projectId }, data: { stage: transition.toStage } })] : []),
    ]);

    await this.notifications.notify({
      userId: transition.requestedById,
      projectId,
      type: 'STAGE_TRANSITION_DECIDED',
      entityType: 'STAGE_TRANSITION',
      entityId: id,
      message: dto.approve
        ? `Advancing to ${transition.toStage} was approved`
        : `Advancing to ${transition.toStage} was rejected`,
    });

    return this.prisma.stageTransition.findFirst({ where: { id }, include: TRANSITION_INCLUDE });
  }
}
