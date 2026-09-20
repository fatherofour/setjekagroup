import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { assertAcyclic, computeSchedule, endDateFromStart, type CpmActivityInput, type CpmDependencyInput } from './schedule-cpm.util.js';
import type { CreateActivityDto } from './dto/create-activity.dto.js';
import type { UpdateActivityDto } from './dto/update-activity.dto.js';
import type { CreateDependencyDto } from './dto/create-dependency.dto.js';
import type { UpdateDependencyDto } from './dto/update-dependency.dto.js';

const ACTIVITY_INCLUDE = {
  asSuccessorOf: true,
  projectNode: { select: { id: true, name: true, type: true } },
  contractor: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } },
} as const;

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAllActivities(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.scheduleActivity.findMany({
      where: { projectId },
      include: ACTIVITY_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
    });
  }

  async findAllDependencies(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.scheduleDependency.findMany({ where: { projectId } });
  }

  private async assertBelongsToProject(model: 'projectNode' | 'contractor' | 'projectMember', id: string, projectId: string) {
    if (model === 'contractor') {
      // Contractor is a global directory, not project-scoped — just check it exists.
      const found = await this.prisma.contractor.findUnique({ where: { id } });
      if (!found) throw new BadRequestException('Contractor not found');
      return;
    }
    if (model === 'projectNode') {
      const found = await this.prisma.projectNode.findFirst({ where: { id, projectId } });
      if (!found) throw new BadRequestException('Project node not found in this project');
      return;
    }
    const found = await this.prisma.projectMember.findFirst({ where: { id, projectId } });
    if (!found) throw new BadRequestException('Team member not found in this project');
  }

  private async assertActivityBelongsToProject(activityId: string, projectId: string) {
    const found = await this.prisma.scheduleActivity.findFirst({ where: { id: activityId, projectId } });
    if (!found) throw new BadRequestException('Activity not found in this project');
    return found;
  }

  async createActivity(projectId: string, ownerId: string, dto: CreateActivityDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.parentId) await this.assertActivityBelongsToProject(dto.parentId, projectId);
    if (dto.projectNodeId) await this.assertBelongsToProject('projectNode', dto.projectNodeId, projectId);
    if (dto.contractorId) await this.assertBelongsToProject('contractor', dto.contractorId, projectId);
    if (dto.assignedToId) await this.assertBelongsToProject('projectMember', dto.assignedToId, projectId);

    const isMilestone = dto.activityType === 'MILESTONE';
    const durationDays = isMilestone ? 0 : (dto.durationDays ?? 1);
    const startDate = new Date(dto.startDate);
    const endDate = endDateFromStart(startDate, durationDays);

    const activity = await this.prisma.scheduleActivity.create({
      data: {
        projectId,
        parentId: dto.parentId,
        projectNodeId: dto.projectNodeId,
        contractorId: dto.contractorId,
        assignedToId: dto.assignedToId,
        name: dto.name,
        description: dto.description,
        activityType: dto.activityType,
        startDate,
        endDate,
        durationDays,
        percentComplete: dto.percentComplete,
        priority: dto.priority,
        status: dto.status,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.recalculate(projectId);
    return this.getActivity(projectId, activity.id);
  }

  async getActivity(projectId: string, activityId: string) {
    const activity = await this.prisma.scheduleActivity.findFirst({ where: { id: activityId, projectId }, include: ACTIVITY_INCLUDE });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async updateActivity(projectId: string, ownerId: string, activityId: string, dto: UpdateActivityDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.assertActivityBelongsToProject(activityId, projectId);
    if (dto.parentId) {
      if (dto.parentId === activityId) throw new BadRequestException('An activity cannot be its own parent');
      await this.assertActivityBelongsToProject(dto.parentId, projectId);
    }
    if (dto.projectNodeId) await this.assertBelongsToProject('projectNode', dto.projectNodeId, projectId);
    if (dto.contractorId) await this.assertBelongsToProject('contractor', dto.contractorId, projectId);
    if (dto.assignedToId) await this.assertBelongsToProject('projectMember', dto.assignedToId, projectId);

    const nextType = dto.activityType ?? existing.activityType;
    const isMilestone = nextType === 'MILESTONE';
    const nextDuration = isMilestone ? 0 : (dto.durationDays ?? existing.durationDays);
    const nextStart = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const nextEnd = endDateFromStart(nextStart, nextDuration);

    await this.prisma.scheduleActivity.update({
      where: { id: activityId },
      data: {
        name: dto.name,
        description: dto.description,
        activityType: dto.activityType,
        startDate: nextStart,
        endDate: nextEnd,
        durationDays: nextDuration,
        percentComplete: dto.percentComplete,
        priority: dto.priority,
        status: dto.status,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        projectNodeId: dto.projectNodeId === undefined ? undefined : dto.projectNodeId,
        contractorId: dto.contractorId === undefined ? undefined : dto.contractorId,
        assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
        sortOrder: dto.sortOrder,
      },
    });

    await this.recalculate(projectId);
    return this.getActivity(projectId, activityId);
  }

  async removeActivity(projectId: string, ownerId: string, activityId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.assertActivityBelongsToProject(activityId, projectId);
    await this.prisma.scheduleActivity.delete({ where: { id: activityId } });
    await this.recalculate(projectId);
  }

  async createDependency(projectId: string, ownerId: string, dto: CreateDependencyDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.predecessorId === dto.successorId) throw new BadRequestException('An activity cannot depend on itself');
    await this.assertActivityBelongsToProject(dto.predecessorId, projectId);
    await this.assertActivityBelongsToProject(dto.successorId, projectId);

    const existing = await this.prisma.scheduleDependency.findUnique({
      where: { predecessorId_successorId: { predecessorId: dto.predecessorId, successorId: dto.successorId } },
    });
    if (existing) throw new BadRequestException('This dependency already exists');

    // Validate for cycles against the candidate dependency BEFORE saving —
    // assertAcyclic throws ScheduleCycleError (a 400) if the graph
    // (including this new edge) isn't a DAG.
    const [activityIds, dependencies] = await Promise.all([
      this.prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.scheduleDependency.findMany({ where: { projectId } }),
    ]);
    const candidateDeps: CpmDependencyInput[] = [
      ...toCpmDependencies(dependencies),
      { predecessorId: dto.predecessorId, successorId: dto.successorId, type: dto.type ?? 'FS', lagDays: dto.lagDays ?? 0 },
    ];
    assertAcyclic(activityIds.map((a) => a.id), candidateDeps);

    await this.prisma.scheduleDependency.create({
      data: {
        projectId,
        predecessorId: dto.predecessorId,
        successorId: dto.successorId,
        type: dto.type,
        lagDays: dto.lagDays,
      },
    });

    await this.recalculate(projectId);
    return this.findAllDependencies(projectId, ownerId);
  }

  async updateDependency(projectId: string, ownerId: string, dependencyId: string, dto: UpdateDependencyDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.prisma.scheduleDependency.findFirst({ where: { id: dependencyId, projectId } });
    if (!existing) throw new NotFoundException('Dependency not found');

    await this.prisma.scheduleDependency.update({
      where: { id: dependencyId },
      data: { type: dto.type, lagDays: dto.lagDays },
    });
    await this.recalculate(projectId);
    return this.findAllDependencies(projectId, ownerId);
  }

  async removeDependency(projectId: string, ownerId: string, dependencyId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.prisma.scheduleDependency.findFirst({ where: { id: dependencyId, projectId } });
    if (!existing) throw new NotFoundException('Dependency not found');
    await this.prisma.scheduleDependency.delete({ where: { id: dependencyId } });
    await this.recalculate(projectId);
  }

  /** Recomputes CPM for every activity in a project and persists the result. */
  async recalculate(projectId: string) {
    const [activities, dependencies] = await Promise.all([
      this.prisma.scheduleActivity.findMany({ where: { projectId } }),
      this.prisma.scheduleDependency.findMany({ where: { projectId } }),
    ]);
    if (activities.length === 0) return;

    const successorIds = new Set(dependencies.map((d) => d.successorId));
    const results = computeSchedule(toCpmActivities(activities, successorIds), toCpmDependencies(dependencies));

    await this.prisma.$transaction(
      activities.map((activity) => {
        const result = results.get(activity.id)!;
        return this.prisma.scheduleActivity.update({
          where: { id: activity.id },
          data: {
            startDate: result.startDate,
            endDate: result.endDate,
            earlyStart: result.earlyStart,
            earlyFinish: result.earlyFinish,
            lateStart: result.lateStart,
            lateFinish: result.lateFinish,
            totalFloatDays: result.totalFloatDays,
            isCriticalPath: result.isCriticalPath,
          },
        });
      }),
    );
  }
}

function toCpmActivities(
  activities: { id: string; startDate: Date; durationDays: number }[],
  successorIds: Set<string> | string[],
): CpmActivityInput[] {
  const successorSet = successorIds instanceof Set ? successorIds : new Set(successorIds);
  return activities.map((a) => ({
    id: a.id,
    startDate: a.startDate,
    durationDays: a.durationDays,
    hasPredecessors: successorSet.has(a.id),
  }));
}

function toCpmDependencies(dependencies: { predecessorId: string; successorId: string; type: string; lagDays: number }[]): CpmDependencyInput[] {
  return dependencies.map((d) => ({
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type as CpmDependencyInput['type'],
    lagDays: d.lagDays,
  }));
}
