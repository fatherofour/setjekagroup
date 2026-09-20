import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import type { Prisma } from '../generated/prisma/client.js';

const TASK_INCLUDE = {
  assignedTo: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } },
  scheduleActivity: { select: { id: true, name: true } },
  projectNode: { select: { id: true, name: true, type: true } },
} as const;

@Injectable()
export class ProjectTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.projectTask.findMany({ where: { projectId }, include: TASK_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  private async assertMemberInProject(memberId: string, projectId: string) {
    const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!found) throw new BadRequestException('Team member not found in this project');
    return found;
  }

  private async assertScheduleActivityInProject(activityId: string, projectId: string) {
    const found = await this.prisma.scheduleActivity.findFirst({ where: { id: activityId, projectId } });
    if (!found) throw new BadRequestException('Schedule activity not found in this project');
  }

  private async assertProjectNodeInProject(nodeId: string, projectId: string) {
    const found = await this.prisma.projectNode.findFirst({ where: { id: nodeId, projectId } });
    if (!found) throw new BadRequestException('Project node not found in this project');
  }

  async create(projectId: string, ownerId: string, dto: CreateTaskDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.assignedToId) await this.assertMemberInProject(dto.assignedToId, projectId);
    if (dto.scheduleActivityId) await this.assertScheduleActivityInProject(dto.scheduleActivityId, projectId);
    if (dto.projectNodeId) await this.assertProjectNodeInProject(dto.projectNodeId, projectId);

    const task = await this.prisma.projectTask.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedToId: dto.assignedToId,
        scheduleActivityId: dto.scheduleActivityId,
        projectNodeId: dto.projectNodeId,
        checklist: (dto.checklist ?? []) as unknown as Prisma.InputJsonValue,
      },
    });

    if (dto.assignedToId) {
      const member = await this.prisma.projectMember.findUnique({ where: { id: dto.assignedToId } });
      await this.notifications.notify({
        userId: member?.userId,
        projectId,
        type: 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: task.id,
        message: `You were assigned the task "${task.title}"`,
      });
    }

    return this.getOne(projectId, task.id);
  }

  async getOne(projectId: string, id: string) {
    const task = await this.prisma.projectTask.findFirst({ where: { id, projectId }, include: TASK_INCLUDE });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateTaskDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    if (dto.assignedToId) await this.assertMemberInProject(dto.assignedToId, projectId);
    if (dto.scheduleActivityId) await this.assertScheduleActivityInProject(dto.scheduleActivityId, projectId);
    if (dto.projectNodeId) await this.assertProjectNodeInProject(dto.projectNodeId, projectId);

    await this.prisma.projectTask.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
        scheduleActivityId: dto.scheduleActivityId === undefined ? undefined : dto.scheduleActivityId,
        projectNodeId: dto.projectNodeId === undefined ? undefined : dto.projectNodeId,
        checklist: dto.checklist === undefined ? undefined : (dto.checklist as unknown as Prisma.InputJsonValue),
      },
    });

    // Only notify when the assignee actually changed to someone new — an
    // unrelated edit (e.g. ticking a checklist item) shouldn't re-notify.
    if (dto.assignedToId && dto.assignedToId !== existing.assignedTo?.id) {
      const member = await this.prisma.projectMember.findUnique({ where: { id: dto.assignedToId } });
      await this.notifications.notify({
        userId: member?.userId,
        projectId,
        type: 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: id,
        message: `You were assigned the task "${dto.title ?? existing.title}"`,
      });
    }

    return this.getOne(projectId, id);
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.projectTask.delete({ where: { id } });
  }
}
