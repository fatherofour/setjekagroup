import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectDto } from './dto/create-project.dto.js';
import type { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForOwner(ownerId: string) {
    return this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForOwner(id: string, ownerId: string) {
    const project = await this.prisma.project.findFirst({ where: { id, ownerId } });
    if (!project) throw new NotFoundException('Project not found');
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
