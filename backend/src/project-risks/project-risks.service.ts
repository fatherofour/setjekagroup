import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateRiskDto } from './dto/create-risk.dto.js';
import type { UpdateRiskDto } from './dto/update-risk.dto.js';

const RISK_INCLUDE = {
  owner: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } },
} as const;

// The register asks for "configurable" escalation notifications, but no
// configuration surface exists anywhere in this app for any business rule
// yet — a fixed, documented threshold (top third of the 1-25 score range)
// is the honest V1.
export const HIGH_SEVERITY_THRESHOLD = 15;

@Injectable()
export class ProjectRisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.projectRisk.findMany({ where: { projectId }, include: RISK_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  private async assertMemberInProject(memberId: string, projectId: string) {
    const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!found) throw new BadRequestException('Team member not found in this project');
  }

  private async notifyIfEscalated(projectId: string, riskId: string, title: string, ownerMemberId: string | undefined, score: number) {
    if (!ownerMemberId || score < HIGH_SEVERITY_THRESHOLD) return;
    const member = await this.prisma.projectMember.findUnique({ where: { id: ownerMemberId } });
    await this.notifications.notify({
      userId: member?.userId,
      projectId,
      type: 'RISK_ESCALATED',
      entityType: 'RISK',
      entityId: riskId,
      message: `Risk "${title}" has reached a high severity score (${score})`,
    });
  }

  async create(projectId: string, ownerId: string, dto: CreateRiskDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.ownerId) await this.assertMemberInProject(dto.ownerId, projectId);

    const risk = await this.prisma.projectRisk.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        probability: dto.probability,
        impact: dto.impact,
        ownerId: dto.ownerId,
        mitigation: dto.mitigation,
        status: dto.status,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
      },
    });

    await this.notifyIfEscalated(projectId, risk.id, risk.title, dto.ownerId, dto.probability * dto.impact);

    return this.getOne(projectId, risk.id);
  }

  async getOne(projectId: string, id: string) {
    const risk = await this.prisma.projectRisk.findFirst({ where: { id, projectId }, include: RISK_INCLUDE });
    if (!risk) throw new NotFoundException('Risk not found');
    return risk;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateRiskDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    if (dto.ownerId) await this.assertMemberInProject(dto.ownerId, projectId);

    await this.prisma.projectRisk.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        probability: dto.probability,
        impact: dto.impact,
        ownerId: dto.ownerId === undefined ? undefined : dto.ownerId,
        mitigation: dto.mitigation,
        status: dto.status,
        reviewDate: dto.reviewDate === undefined ? undefined : dto.reviewDate ? new Date(dto.reviewDate) : null,
      },
    });

    const nextProbability = dto.probability ?? existing.probability;
    const nextImpact = dto.impact ?? existing.impact;
    const nextScore = nextProbability * nextImpact;
    const previousScore = existing.probability * existing.impact;
    const nextOwnerId = dto.ownerId === undefined ? existing.owner?.id : (dto.ownerId ?? undefined);
    const ownerChanged = dto.ownerId !== undefined && dto.ownerId !== existing.owner?.id;

    // Only re-notify when the risk newly crosses the threshold (wasn't
    // already high) or a new owner has just taken on an already-high risk —
    // an unrelated edit to a long-standing high risk shouldn't re-notify.
    if (nextScore >= HIGH_SEVERITY_THRESHOLD && (previousScore < HIGH_SEVERITY_THRESHOLD || ownerChanged)) {
      await this.notifyIfEscalated(projectId, id, dto.title ?? existing.title, nextOwnerId, nextScore);
    }

    return this.getOne(projectId, id);
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.projectRisk.delete({ where: { id } });
  }
}
