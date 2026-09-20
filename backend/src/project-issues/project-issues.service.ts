import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateIssueDto } from './dto/create-issue.dto.js';
import type { UpdateIssueDto } from './dto/update-issue.dto.js';

const ISSUE_INCLUDE = {
  owner: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } },
} as const;

@Injectable()
export class ProjectIssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.projectIssue.findMany({ where: { projectId }, include: ISSUE_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  private async assertMemberInProject(memberId: string, projectId: string) {
    const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!found) throw new BadRequestException('Team member not found in this project');
  }

  async create(projectId: string, ownerId: string, dto: CreateIssueDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.ownerId) await this.assertMemberInProject(dto.ownerId, projectId);

    const issue = await this.prisma.projectIssue.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        impact: dto.impact,
        status: dto.status,
        resolutionNotes: dto.resolutionNotes,
        dueDate: dto.dueDate,
        ownerId: dto.ownerId,
      },
    });

    if (dto.ownerId) {
      const member = await this.prisma.projectMember.findUnique({ where: { id: dto.ownerId } });
      await this.notifications.notify({
        userId: member?.userId,
        projectId,
        type: 'ISSUE_ASSIGNED',
        entityType: 'ISSUE',
        entityId: issue.id,
        message: `You were assigned the issue "${issue.title}"`,
      });
    }

    return this.getOne(projectId, issue.id);
  }

  async getOne(projectId: string, id: string) {
    const issue = await this.prisma.projectIssue.findFirst({ where: { id, projectId }, include: ISSUE_INCLUDE });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateIssueDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    if (dto.ownerId) await this.assertMemberInProject(dto.ownerId, projectId);

    await this.prisma.projectIssue.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        impact: dto.impact,
        status: dto.status,
        resolutionNotes: dto.resolutionNotes,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate,
        ownerId: dto.ownerId === undefined ? undefined : dto.ownerId,
      },
    });

    if (dto.ownerId && dto.ownerId !== existing.owner?.id) {
      const member = await this.prisma.projectMember.findUnique({ where: { id: dto.ownerId } });
      await this.notifications.notify({
        userId: member?.userId,
        projectId,
        type: 'ISSUE_ASSIGNED',
        entityType: 'ISSUE',
        entityId: id,
        message: `You were assigned the issue "${dto.title ?? existing.title}"`,
      });
    }

    return this.getOne(projectId, id);
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.projectIssue.delete({ where: { id } });
  }
}
