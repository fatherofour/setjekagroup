import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectDto } from './dto/create-project.dto.js';
import type { UpdateProjectDto } from './dto/update-project.dto.js';

/** Every project-nested service in this app calls `findOneForOwner`
 * (and callers pass the current user's id as `ownerId`, unchanged) for its
 * authorization check - this is the single chokepoint the Administration
 * module's project-visibility model hooks into, so no other service needs
 * to change. Internal Setjeka staff (`accountType: INTERNAL`, or platform
 * `role: ADMIN`) see every project; external users only see projects
 * where they hold a `ProjectMember` row linked to their account. The
 * method keeps its original name/signature despite no longer meaning
 * "owns this project" - renaming it would mean touching every one of its
 * ~20 call sites for a purely cosmetic gain. */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForOwner(callerId: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (caller?.role === 'ADMIN' || caller?.accountType === 'INTERNAL') {
      return this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
    }
    return this.prisma.project.findMany({
      where: { members: { some: { userId: callerId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForOwner(id: string, callerId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    const caller = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (caller?.role === 'ADMIN' || caller?.accountType === 'INTERNAL') return project;

    const membership = await this.prisma.projectMember.findFirst({ where: { projectId: id, userId: callerId } });
    if (!membership) throw new ForbiddenException('You do not have access to this project');
    return project;
  }

  /** Next `PRJ-{year}-{seq}` code for the current calendar year, scanning
   * existing codes rather than a separate counter table - simple and
   * sufficient at this project's scale (single-owner, low write volume). */
  private async nextProjectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PRJ-${year}-`;
    const latest = await this.prisma.project.findFirst({
      where: { projectCode: { startsWith: prefix } },
      orderBy: { projectCode: 'desc' },
      select: { projectCode: true },
    });
    let nextSeq = 1;
    if (latest?.projectCode) {
      const seq = Number.parseInt(latest.projectCode.slice(prefix.length), 10);
      if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /** Display-only preview - does not reserve the code. */
  previewNextProjectCode(): Promise<string> {
    return this.nextProjectCode();
  }

  async create(ownerId: string, dto: CreateProjectDto) {
    const projectCode = dto.projectCode?.trim() || (await this.nextProjectCode());
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        projectCode,
        status: dto.status,
        stage: dto.stage,
        projectType: dto.projectType,
        contractForm: dto.contractForm,
        currency: dto.currency,
        classificationStandard: dto.classificationStandard,
        client: dto.client,
        developer: dto.developer,
        location: dto.location,
        value: dto.value,
        contingencyPct: dto.contingencyPct,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        ownerId,
      },
    });
  }

  async update(id: string, ownerId: string, dto: UpdateProjectDto) {
    await this.findOneForOwner(id, ownerId);
    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        projectCode: dto.projectCode,
        status: dto.status,
        stage: dto.stage,
        projectType: dto.projectType,
        contractForm: dto.contractForm,
        currency: dto.currency,
        classificationStandard: dto.classificationStandard,
        client: dto.client,
        developer: dto.developer,
        location: dto.location,
        value: dto.value,
        contingencyPct: dto.contingencyPct,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }
}
