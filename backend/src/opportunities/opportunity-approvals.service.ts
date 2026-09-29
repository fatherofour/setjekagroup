import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateApprovalDto } from './dto/create-approval.dto.js';
import type { UpdateApprovalDto } from './dto/update-approval.dto.js';

const APPROVAL_INCLUDE = { owner: { select: { id: true, fullName: true } } } as const;

@Injectable()
export class OpportunityApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOpportunityExists(opportunityId: string) {
    const found = await this.prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true } });
    if (!found) throw new NotFoundException('Opportunity not found');
  }

  async findAll(opportunityId: string) {
    await this.assertOpportunityExists(opportunityId);
    return this.prisma.opportunityApproval.findMany({
      where: { opportunityId },
      include: APPROVAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(opportunityId: string, dto: CreateApprovalDto) {
    await this.assertOpportunityExists(opportunityId);
    return this.prisma.opportunityApproval.create({
      data: {
        opportunityId,
        approvalType: dto.approvalType,
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
    await this.findOwned(opportunityId, id);
    return this.prisma.opportunityApproval.update({
      where: { id },
      data: {
        approvalType: dto.approvalType,
        status: dto.status,
        ownerId: dto.ownerId === undefined ? undefined : dto.ownerId,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        evidenceNotes: dto.evidenceNotes,
      },
      include: APPROVAL_INCLUDE,
    });
  }

  async remove(opportunityId: string, id: string) {
    await this.findOwned(opportunityId, id);
    await this.prisma.opportunityApproval.delete({ where: { id } });
  }
}
