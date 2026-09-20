import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateBaselineDto } from './dto/create-baseline.dto.js';

const BASELINE_INCLUDE = { snapshots: true } as const;

@Injectable()
export class ScheduleBaselinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.scheduleBaseline.findMany({ where: { projectId }, include: BASELINE_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(projectId: string, ownerId: string, dto: CreateBaselineDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const activities = await this.prisma.scheduleActivity.findMany({ where: { projectId } });

    return this.prisma.scheduleBaseline.create({
      data: {
        projectId,
        name: dto.name,
        createdById: ownerId,
        snapshots: {
          create: activities.map((a) => ({
            activityId: a.id,
            baselineStart: a.startDate,
            baselineEnd: a.endDate,
            baselineDurationDays: a.durationDays,
          })),
        },
      },
      include: BASELINE_INCLUDE,
    });
  }

  async remove(projectId: string, ownerId: string, baselineId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.prisma.scheduleBaseline.findFirst({ where: { id: baselineId, projectId } });
    if (!existing) throw new NotFoundException('Baseline not found');
    await this.prisma.scheduleBaseline.delete({ where: { id: baselineId } });
  }
}
