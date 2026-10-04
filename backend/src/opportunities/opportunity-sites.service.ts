import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOpportunitySiteDto, UpdateOpportunitySiteDto } from './dto/opportunity-site.dto.js';
import { markMilestone } from './milestones.js';

const SECURED = ['AGREEMENT_SIGNED', 'TRANSFERRED', 'LEASED'];

@Injectable()
export class OpportunitySitesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getEditableOpportunity(opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    if (opportunity.stage === 'CONVERTED') throw new BadRequestException('This opportunity has been converted; its site register is read-only');
    return opportunity;
  }

  private async getSite(opportunityId: string, siteId: string) {
    const site = await this.prisma.opportunitySite.findFirst({ where: { id: siteId, opportunityId } });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async findAll(opportunityId: string) {
    const exists = await this.prisma.opportunity.count({ where: { id: opportunityId } });
    if (!exists) throw new NotFoundException('Opportunity not found');
    return this.prisma.opportunitySite.findMany({ where: { opportunityId }, orderBy: { createdAt: 'asc' } });
  }

  async create(opportunityId: string, dto: CreateOpportunitySiteDto) {
    const opportunity = await this.getEditableOpportunity(opportunityId);
    return this.prisma.opportunitySite.create({
      data: { ...dto, name: dto.name.trim(), currency: dto.currency ?? opportunity.currency, opportunityId },
    });
  }

  async update(opportunityId: string, siteId: string, dto: UpdateOpportunitySiteDto) {
    await this.getEditableOpportunity(opportunityId);
    const site = await this.getSite(opportunityId, siteId);
    if (dto.status === 'SELECTED' && site.status !== 'SELECTED') {
      throw new BadRequestException('Use "Select this site" to choose the site for this opportunity');
    }
    const updated = await this.prisma.opportunitySite.update({
      where: { id: siteId },
      data: {
        ...dto,
        name: dto.name?.trim(),
        agreementDate: dto.agreementDate === undefined ? undefined : dto.agreementDate ? new Date(dto.agreementDate) : null,
        transferDate: dto.transferDate === undefined ? undefined : dto.transferDate ? new Date(dto.transferDate) : null,
      },
    });
    // PROCSA 0.4/0.5: the chosen site secured -> "Site secured" milestone.
    if (updated.status === 'SELECTED' && SECURED.includes(updated.acquisitionStatus)) {
      await markMilestone(this.prisma, { opportunityId }, 'SITE_SECURED', updated.agreementDate ?? new Date());
    }
    return updated;
  }

  /** Exactly one site can be the chosen one; any previously selected site
   * drops back to shortlisted rather than being lost. */
  async select(opportunityId: string, siteId: string) {
    await this.getEditableOpportunity(opportunityId);
    await this.getSite(opportunityId, siteId);
    await this.prisma.$transaction([
      this.prisma.opportunitySite.updateMany({
        where: { opportunityId, status: 'SELECTED', NOT: { id: siteId } },
        data: { status: 'SHORTLISTED' },
      }),
      this.prisma.opportunitySite.update({ where: { id: siteId }, data: { status: 'SELECTED' } }),
    ]);
    return this.findAll(opportunityId);
  }

  async remove(opportunityId: string, siteId: string) {
    await this.getEditableOpportunity(opportunityId);
    await this.getSite(opportunityId, siteId);
    await this.prisma.opportunitySite.delete({ where: { id: siteId } });
  }
}
