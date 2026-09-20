import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import type { CommentEntityType } from '../generated/prisma/enums.js';

const AUTHOR_INCLUDE = { author: { select: { id: true, fullName: true } } } as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertEntityInProject(entityType: CommentEntityType, entityId: string, projectId: string) {
    const found = await ({
      TASK: () => this.prisma.projectTask.findFirst({ where: { id: entityId, projectId } }),
      ISSUE: () => this.prisma.projectIssue.findFirst({ where: { id: entityId, projectId } }),
      SCHEDULE_ACTIVITY: () => this.prisma.scheduleActivity.findFirst({ where: { id: entityId, projectId } }),
      DOCUMENT_REVISION: () => this.prisma.documentRevision.findFirst({ where: { id: entityId, document: { projectId } } }),
      RISK: () => this.prisma.projectRisk.findFirst({ where: { id: entityId, projectId } }),
    })[entityType]();
    if (!found) throw new BadRequestException(`${entityType} not found in this project`);
  }

  async findAll(projectId: string, ownerId: string, entityType: CommentEntityType, entityId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.comment.findMany({ where: { projectId, entityType, entityId }, include: AUTHOR_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async create(projectId: string, ownerId: string, authorId: string, dto: CreateCommentDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.assertEntityInProject(dto.entityType, dto.entityId, projectId);

    const comment = await this.prisma.comment.create({
      data: { projectId, entityType: dto.entityType, entityId: dto.entityId, authorId, body: dto.body },
      include: AUTHOR_INCLUDE,
    });

    await this.notifyMentions(projectId, dto.body, dto.entityType, dto.entityId, authorId);

    return comment;
  }

  // Plain substring match of "@Full Name" against the project's members —
  // simpler and more predictable than a name-fragment regex, and avoids
  // false positives from a bare "@" with no real mention.
  private async notifyMentions(projectId: string, body: string, entityType: CommentEntityType, entityId: string, authorId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null } },
      select: { userId: true, user: { select: { id: true, fullName: true } } },
    });
    for (const member of members) {
      if (!member.user || member.user.id === authorId) continue;
      if (body.includes(`@${member.user.fullName}`)) {
        await this.notifications.notify({
          userId: member.user.id,
          projectId,
          type: 'MENTIONED',
          entityType,
          entityId,
          message: `You were mentioned in a comment`,
        });
      }
    }
  }

  async remove(projectId: string, ownerId: string, id: string, requesterId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const comment = await this.prisma.comment.findFirst({ where: { id, projectId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== requesterId) throw new ForbiddenException('You can only delete your own comments');
    await this.prisma.comment.delete({ where: { id } });
  }
}
