import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { VendorQuoteDto } from './dto/vendor-quote.dto.js';
import { resolveQuoteItems } from '../rfqs/quote-items.js';
import { computeViability } from '../inception/viability.js';
import { markMilestone, milestoneStatus } from '../opportunities/milestones.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read models for the two external portals. Everything is scoped by the
 * caller's own User.clientId / User.contractorId, looked up fresh on every
 * request (never trusted from the token), so revoking portal access takes
 * effect immediately. Competing quotes, scores and other firms' names are
 * never exposed to either portal. */
@Injectable()
export class PortalViewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async callerClientId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { clientId: true } });
    if (!user?.clientId) throw new ForbiddenException('This account has no client portal access');
    return user.clientId;
  }

  private async callerContractorId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { contractorId: true } });
    if (!user?.contractorId) throw new ForbiddenException('This account has no vendor portal access');
    return user.contractorId;
  }

  async clientOpportunities(userId: string) {
    const clientId = await this.callerClientId(userId);
    return this.prisma.opportunity.findMany({
      where: { clientId },
      select: {
        id: true,
        name: true,
        developmentType: true,
        location: true,
        stage: true,
        updatedAt: true,
        convertedProject: { select: { id: true, name: true, projectCode: true } },
        sites: { where: { status: 'SELECTED' }, select: { name: true, address: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async clientOpportunity(userId: string, opportunityId: string) {
    const clientId = await this.callerClientId(userId);
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, clientId },
      select: {
        id: true,
        name: true,
        description: true,
        developmentType: true,
        location: true,
        estimatedValue: true,
        currency: true,
        stage: true,
        createdAt: true,
        needAndDesirability: true,
        clientVision: true,
        visionConfirmedAt: true,
        visionConfirmedBy: { select: { fullName: true } },
        owner: { select: { fullName: true, email: true } },
        client: { select: { name: true } },
        convertedProject: { select: { id: true, name: true, projectCode: true } },
        stageHistory: { select: { id: true, previousStage: true, newStage: true, comment: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
        sites: {
          select: { id: true, name: true, address: true, erfNumber: true, sizeSqm: true, zoning: true, status: true, acquisitionStatus: true },
          where: { status: { not: 'REJECTED' } },
          orderBy: { createdAt: 'asc' },
        },
        approvals: { select: { id: true, approvalType: true, category: true, status: true, dueDate: true }, orderBy: { createdAt: 'asc' } },
        appointments: {
          select: { id: true, role: true, discipline: true, createdAt: true, contractor: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        businessCases: { where: { isPreferred: true } },
        milestones: { select: { id: true, name: true, baselineDate: true, targetDate: true, actualDate: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    // The client owns the development, so they see the preferred business
    // case's headline numbers — but not the consultants' fees or quotes.
    const { businessCases, milestones, ...rest } = opportunity;
    const bc = businessCases[0];
    return {
      ...rest,
      businessCase: bc ? { name: bc.name, revenueMode: bc.revenueMode, targetProfitPct: bc.targetProfitPct, result: computeViability(bc) } : null,
      milestones: milestones.map((m) => ({ ...m, ...milestoneStatus(m) })),
    };
  }

  /** PROCSA 0.3 "Formalise Client's Vision": the client confirms the vision
   * Setjeka has written up. Editing it later clears the confirmation. */
  async confirmVision(userId: string, opportunityId: string) {
    const clientId = await this.callerClientId(userId);
    const opportunity = await this.prisma.opportunity.findFirst({ where: { id: opportunityId, clientId } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    if (!opportunity.clientVision?.trim()) throw new BadRequestException('There is no vision to confirm yet');
    if (opportunity.stage === 'CONVERTED') throw new BadRequestException('This development is already a project');
    const now = new Date();
    await this.prisma.opportunity.update({ where: { id: opportunityId }, data: { visionConfirmedAt: now, visionConfirmedById: userId } });
    await markMilestone(this.prisma, { opportunityId }, 'CLIENT_VISION', now);
    return this.clientOpportunity(userId, opportunityId);
  }

  async vendorRfqs(userId: string) {
    const contractorId = await this.callerContractorId(userId);
    const rfqs = await this.prisma.rfq.findMany({
      where: { invitations: { some: { contractorId } }, status: { not: 'DRAFT' } },
      select: {
        id: true,
        rfqNumber: true,
        title: true,
        scopeDescription: true,
        discipline: true,
        currency: true,
        dueDate: true,
        status: true,
        createdAt: true,
        opportunity: { select: { name: true, location: true, developmentType: true } },
        project: { select: { name: true, location: true } },
        quotes: {
          where: { contractorId, status: 'SUBMITTED' },
          select: {
            id: true,
            price: true,
            currency: true,
            leadTimeDays: true,
            technicalProposal: true,
            commercialTerms: true,
            updatedAt: true,
            items: { select: { rfqItemId: true, unitRate: true } },
          },
        },
        items: { select: { id: true, description: true, unit: true, quantity: true }, orderBy: { sortOrder: 'asc' } },
        costRegion: { select: { currency: true } },
        awardedQuote: { select: { contractorId: true } },
        opportunityAppointments: { where: { contractorId }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rfqs.map(({ quotes, opportunityAppointments, awardedQuote, costRegion, ...rfq }) => ({
      ...rfq,
      // A works RFQ is priced in its cost region's currency.
      currency: rfq.currency ?? costRegion?.currency ?? null,
      myQuote: quotes[0] ?? null,
      awardedToYou: opportunityAppointments.length > 0 || awardedQuote?.contractorId === contractorId,
      acceptingQuotes: this.acceptingQuotes(rfq),
    }));
  }

  private acceptingQuotes(rfq: { status: string; dueDate: Date | null }) {
    if (rfq.status !== 'ISSUED') return false;
    // A due date means "by the end of that day".
    return !rfq.dueDate || Date.now() < rfq.dueDate.getTime() + DAY_MS;
  }

  private async invitedRfq(contractorId: string, rfqId: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: rfqId, invitations: { some: { contractorId } }, status: { not: 'DRAFT' } },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  async submitQuote(userId: string, rfqId: string, dto: VendorQuoteDto) {
    const contractorId = await this.callerContractorId(userId);
    const rfq = await this.invitedRfq(contractorId, rfqId);
    if (!this.acceptingQuotes(rfq)) throw new BadRequestException('This RFQ is no longer accepting quotes');

    const priced = await resolveQuoteItems(this.prisma, rfqId, dto.items, dto.price);
    const data = {
      price: priced.price,
      currency: dto.currency,
      leadTimeDays: dto.leadTimeDays,
      technicalProposal: dto.technicalProposal,
      commercialTerms: dto.commercialTerms,
    };
    const existing = await this.prisma.quote.findFirst({ where: { rfqId, contractorId, status: 'SUBMITTED' } });
    const items = priced.rows ?? [];
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.quoteItem.deleteMany({ where: { quoteId: existing.id } }),
        this.prisma.quote.update({ where: { id: existing.id }, data: { ...data, submittedById: userId, items: { create: items } } }),
      ]);
    } else {
      await this.prisma.quote.create({ data: { ...data, rfqId, contractorId, submittedById: userId, items: { create: items } } });
    }
    return this.vendorRfqs(userId).then((list) => list.find((r) => r.id === rfqId));
  }

  async withdrawQuote(userId: string, rfqId: string) {
    const contractorId = await this.callerContractorId(userId);
    const rfq = await this.invitedRfq(contractorId, rfqId);
    if (!this.acceptingQuotes(rfq)) throw new BadRequestException('This RFQ is no longer accepting changes');
    await this.prisma.quote.updateMany({ where: { rfqId, contractorId, status: 'SUBMITTED' }, data: { status: 'WITHDRAWN' } });
    return this.vendorRfqs(userId).then((list) => list.find((r) => r.id === rfqId));
  }
}
