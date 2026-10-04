import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { markMilestone } from './milestones.js';
import type { CreateApprovalDto } from './dto/create-approval.dto.js';
import type { UpdateApprovalDto } from './dto/update-approval.dto.js';

const APPROVAL_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  site: { select: { id: true, name: true } },
} as const;

/** PROCSA 0.5 land rights — zoning, environmental, infrastructural /
 * external services and legal — as authority approvals (register DEV R11).
 * Evidence files are OpportunityDocuments linked to the approval. */
@Injectable()
export class OpportunityApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOpportunityOpen(opportunityId: string) {
    const found = await this.prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { stage: true } });
    if (!found) throw new NotFoundException('Opportunity not found');
    if (found.stage === 'CONVERTED') throw new BadRequestException('This opportunity has been converted; its land rights now live in the project’s consents schedule');
  }

  private async assertSite(opportunityId: string, siteId: string | null | undefined) {
    if (!siteId) return;
    if (!(await this.prisma.opportunitySite.count({ where: { id: siteId, opportunityId } }))) {
      throw new BadRequestException('Site not found on this opportunity');
    }
  }

  async findAll(opportunityId: string) {
    const found = await this.prisma.opportunity.count({ where: { id: opportunityId } });
    if (!found) throw new NotFoundException('Opportunity not found');
    return this.prisma.opportunityApproval.findMany({
      where: { opportunityId },
      include: APPROVAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(opportunityId: string, dto: CreateApprovalDto) {
    await this.assertOpportunityOpen(opportunityId);
    await this.assertSite(opportunityId, dto.siteId);
    return this.prisma.opportunityApproval.create({
      data: {
        opportunityId,
        approvalType: dto.approvalType,
        category: dto.category,
        siteId: dto.siteId,
        authority: dto.authority,
        reference: dto.reference,
        ownerId: dto.ownerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        evidenceNotes: dto.evidenceNotes,
      },
      include: APPROVAL_INCLUDE,
    });
  }

  private async findOwned(opportunityId: string, id: string) {
    const approval = await this.prisma.opportunityApproval.findFirst({ where: { id, opportunityId } });
    if (!approval) throw new NotFoundException('Approval not found');
    return approval;
  }

  async update(opportunityId: string, id: string, dto: UpdateApprovalDto) {
    await this.assertOpportunityOpen(opportunityId);
    await this.findOwned(opportunityId, id);
    await this.assertSite(opportunityId, dto.siteId);
    const updated = await this.prisma.opportunityApproval.update({
      where: { id },
      data: {
        approvalType: dto.approvalType,
        category: dto.category,
        siteId: dto.siteId,
        authority: dto.authority,
        reference: dto.reference,
        status: dto.status,
        ownerId: dto.ownerId === undefined ? undefined : dto.ownerId,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        evidenceNotes: dto.evidenceNotes,
      },
      include: APPROVAL_INCLUDE,
    });
    // Every land right granted -> the "land-use rights approved" milestone.
    const all = await this.prisma.opportunityApproval.findMany({ where: { opportunityId }, select: { status: true } });
    if (all.length && all.every((a) => a.status === 'APPROVED')) await markMilestone(this.prisma, { opportunityId }, 'LAND_RIGHTS');
    return updated;
  }

  async remove(opportunityId: string, id: string) {
    await this.assertOpportunityOpen(opportunityId);
    await this.findOwned(opportunityId, id);
    await this.prisma.opportunityApproval.delete({ where: { id } });
  }
}
