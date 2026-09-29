import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import type { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import type { ChangeOpportunityStageDto } from './dto/change-stage.dto.js';

const OPPORTUNITY_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  convertedProject: { select: { id: true, name: true, projectCode: true } },
  approvals: { orderBy: { createdAt: 'desc' } },
} as const;

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  findAll() {
    return this.prisma.opportunity.findMany({ include: OPPORTUNITY_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return opportunity;
  }

  create(createdById: string, dto: CreateOpportunityDto) {
    return this.prisma.opportunity.create({
      data: {
        name: dto.name,
        description: dto.description,
        developmentType: dto.developmentType,
        location: dto.location,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency,
        clientName: dto.clientName,
        clientContactName: dto.clientContactName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        ownerId: dto.ownerId,
        createdById,
      },
      include: OPPORTUNITY_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateOpportunityDto) {
    await this.findOne(id);
    await this.prisma.opportunity.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        developmentType: dto.developmentType,
        location: dto.location,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency,
        clientName: dto.clientName,
        clientContactName: dto.clientContactName,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        ownerId: dto.ownerId === undefined ? undefined : dto.ownerId,
      },
    });
    return this.findOne(id);
  }

  // Every stage change writes an OpportunityStageHistory row in the same
  // transaction - mirrors SubmittalsService.changeStatus's existing
  // OrganisationStatusHistory-style pattern exactly, but as a direct
  // single-actor change rather than the Project StageTransition
  // request/approve workflow (see schema.prisma's comment on why).
  async changeStage(id: string, changedById: string, dto: ChangeOpportunityStageDto) {
    const existing = await this.findOne(id);
    if (existing.stage === 'CONVERTED') throw new BadRequestException('This opportunity has already been converted to a project');
    if (dto.stage === existing.stage) return existing;

    await this.prisma.$transaction([
      this.prisma.opportunity.update({ where: { id }, data: { stage: dto.stage } }),
      this.prisma.opportunityStageHistory.create({
        data: { opportunityId: id, previousStage: existing.stage, newStage: dto.stage, changedById, comment: dto.comment },
      }),
    ]);
    return this.findOne(id);
  }

  getHistory(id: string) {
    return this.prisma.opportunityStageHistory.findMany({
      where: { opportunityId: id },
      include: { changedBy: { select: { id: true, fullName: true } } },
      orderBy: { changedAt: 'asc' },
    });
  }

  // Creates the real Project this opportunity has been building towards,
  // pre-filled from its client/site data - closes the
  // opportunity-project-integration-deferred note directly (the New
  // Project form no longer needs a separate Client dropdown/autofill;
  // this is the cleaner equivalent for this app's architecture).
  async convertToProject(id: string, requestedById: string) {
    const opportunity = await this.findOne(id);
    if (opportunity.stage === 'CONVERTED') throw new BadRequestException('This opportunity has already been converted');
    if (opportunity.stage !== 'APPROVED') throw new BadRequestException('Only an approved opportunity can be converted to a project');

    const project = await this.projectsService.create(opportunity.ownerId ?? requestedById, {
      name: opportunity.name,
      client: opportunity.clientName ?? undefined,
      location: opportunity.location ?? undefined,
      value: opportunity.estimatedValue ?? undefined,
      currency: opportunity.currency ?? undefined,
    });

    await this.prisma.$transaction([
      this.prisma.opportunity.update({ where: { id }, data: { stage: 'CONVERTED', convertedProjectId: project.id } }),
      this.prisma.opportunityStageHistory.create({
        data: {
          opportunityId: id,
          previousStage: opportunity.stage,
          newStage: 'CONVERTED',
          changedById: requestedById,
          comment: `Converted to project ${project.projectCode ?? project.name}`,
        },
      }),
    ]);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.opportunity.delete({ where: { id } });
  }
}
