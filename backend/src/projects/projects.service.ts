import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rulesFor } from '../common/countries.js';
import { seesProjectMoney } from '../common/setjeka-team.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

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

  /** A project as this person may see it: without its value and contingency
   * unless they're Setjeka, the client or the QS. A contractor sees their own
   * contract value instead (FirmDealsService). */
  async forViewer<T extends { id: string; value: number | null; contingencyPct: number | null }>(project: T, userId: string): Promise<T> {
    if (await seesProjectMoney(this.prisma, project.id, userId)) return project;
    return { ...project, value: null, contingencyPct: null };
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
        // A Nigerian project starts in naira unless told otherwise.
        currency: dto.currency ?? (dto.country ? rulesFor(dto.country).currency : undefined),
        country: dto.country,
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

  /** Setjeka's own staff (internal accounts and administrators). */
  async isSetjeka(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    return u?.role === 'ADMIN' || u?.accountType === 'INTERNAL';
  }

  /** Critique C-01: a project's details (name, status, currency, country,
   * contract form, client...) are Setjeka's to change. Consultants,
   * contractors and the client can view them, not edit them (the permission
   * matrix: outside parties "View, comment" on project structure). Every
   * change is written to the audit log. Completing or abandoning a project
   * goes through close-out, not here. */
  async update(id: string, userId: string, dto: UpdateProjectDto) {
    const before = await this.findOneForOwner(id, userId);
    if (!(await this.isSetjeka(userId))) throw new ForbiddenException("Only Setjeka can change a project's details");
    if (before.closureType) throw new BadRequestException(`This project was ${before.closureType === 'COMPLETED' ? 'completed' : 'abandoned'}; its details can no longer be changed`);
    if (dto.status === 'COMPLETED' || dto.status === 'ARCHIVED') {
      throw new BadRequestException('Complete or abandon a project from its Close-out panel, so the client signs the certificate of completion or the reason is recorded');
    }
    const after = await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        projectCode: dto.projectCode,
        status: dto.status,
        projectType: dto.projectType,
        contractForm: dto.contractForm,
        currency: dto.currency,
        country: dto.country,
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
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(dto) as (keyof typeof after)[]) {
      const from = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
      const to = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from: from ?? null, to: to ?? null };
    }
    if (Object.keys(changes).length) {
      await this.audit.log({ userId, action: 'EDIT', module: 'PROJECT_STRUCTURE', entityType: 'PROJECT', entityId: id, projectId: id, metadata: changes as Prisma.InputJsonValue });
    }
    return after;
  }
}
