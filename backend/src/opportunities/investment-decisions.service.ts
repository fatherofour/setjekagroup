import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isExecutive } from '../auth/executive.js';
import { computeViability } from '../inception/viability.js';
import { markMilestone } from './milestones.js';

const INCLUDE = {
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
} as const;

/** The Executive's go / no-go on an opportunity (register DEV rows list an
 * Executive alongside the Development Manager). Requested by the DM with
 * the business case on file; decided by an Executive who isn't the
 * requester. Approval is the only route to APPROVED; a rejection sends it
 * back to evaluation with the Executive's reasons. */
@Injectable()
export class InvestmentDecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(opportunityId: string) {
    return this.prisma.investmentDecision.findMany({ where: { opportunityId }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async request(opportunityId: string, userId: string, comment?: string) {
    const o = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        client: { select: { name: true } },
        businessCases: { where: { isPreferred: true } },
        sites: { where: { status: 'SELECTED' } },
        approvals: { select: { approvalType: true, category: true, status: true } },
        marketResearch: { where: { status: 'COMPLETED' }, select: { title: true, recommendedProduct: true } },
        appointments: { select: { discipline: true, contractValue: true, currency: true, contractor: { select: { name: true } } } },
      },
    });
    if (!o) throw new NotFoundException('Opportunity not found');
    if (!['IDENTIFIED', 'UNDER_EVALUATION', 'ON_HOLD'].includes(o.stage)) {
      throw new BadRequestException(`An opportunity that is ${o.stage.toLowerCase().replace('_', ' ')} can't be put to an investment decision`);
    }
    const missing = [!o.clientId && 'a client', !o.needAndDesirability?.trim() && 'the need and desirability (0.1)', !o.businessCases.length && 'a preferred first business case (0.2)'].filter(Boolean);
    if (missing.length) throw new BadRequestException(`Before asking for a decision, add ${missing.join(', ')}`);
    if (await this.prisma.investmentDecision.count({ where: { opportunityId, status: 'PENDING' } })) {
      throw new BadRequestException('A decision is already pending');
    }

    // What the Executive is deciding on, kept with the decision.
    const bc = o.businessCases[0];
    const snapshot = {
      name: o.name,
      client: o.client?.name,
      needAndDesirability: o.needAndDesirability,
      clientVision: o.clientVision,
      visionConfirmedAt: o.visionConfirmedAt,
      estimatedValue: o.estimatedValue,
      currency: o.currency,
      businessCase: { name: bc.name, inputs: bc, result: computeViability(bc) },
      site: o.sites[0] ? { name: o.sites[0].name, address: o.sites[0].address, acquisitionStatus: o.sites[0].acquisitionStatus, agreedPrice: o.sites[0].agreedPrice } : null,
      landRights: o.approvals,
      marketResearch: o.marketResearch,
      consultants: o.appointments.map((a) => ({ firm: a.contractor.name, discipline: a.discipline, fee: a.contractValue, currency: a.currency })),
    };

    await this.prisma.$transaction([
      this.prisma.investmentDecision.create({
        data: { opportunityId, requestedById: userId, requestComment: comment?.trim() || null, snapshot: snapshot as unknown as Prisma.InputJsonValue },
      }),
      ...(o.stage !== 'UNDER_EVALUATION'
        ? [
            this.prisma.opportunity.update({ where: { id: opportunityId }, data: { stage: 'UNDER_EVALUATION' } }),
            this.prisma.opportunityStageHistory.create({
              data: { opportunityId, previousStage: o.stage, newStage: 'UNDER_EVALUATION', changedById: userId, comment: 'Put to an investment decision' },
            }),
          ]
        : []),
    ]);
    return this.findAll(opportunityId);
  }

  async decide(opportunityId: string, decisionId: string, userId: string, approve: boolean, comment?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (!isExecutive(user)) throw new ForbiddenException('Only an Executive (a Setjeka manager) can make the investment decision');
    const decision = await this.prisma.investmentDecision.findFirst({ where: { id: decisionId, opportunityId } });
    if (!decision) throw new NotFoundException('Decision not found');
    if (decision.status !== 'PENDING') throw new BadRequestException('This decision has already been made');
    if (decision.requestedById === userId) throw new ForbiddenException('The investment decision must be made by someone other than the person who asked for it');
    if (!approve && !comment?.trim()) throw new BadRequestException('Give the reasons when declining');

    const opportunity = await this.prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.investmentDecision.update({
        where: { id: decisionId },
        data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: userId, decidedAt: now, decisionComment: comment?.trim() || null },
      }),
      ...(approve
        ? [
            this.prisma.opportunity.update({ where: { id: opportunityId }, data: { stage: 'APPROVED' } }),
            this.prisma.opportunityStageHistory.create({
              data: { opportunityId, previousStage: opportunity.stage, newStage: 'APPROVED', changedById: userId, comment: comment?.trim() || 'Investment decision approved' },
            }),
          ]
        : []),
    ]);
    if (approve) await markMilestone(this.prisma, { opportunityId }, 'INVESTMENT_DECISION', now);
    return this.findAll(opportunityId);
  }
}
