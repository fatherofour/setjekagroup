import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import type { UpdateQuoteDto } from './dto/update-quote.dto.js';
import type { EvaluateQuoteDto } from './dto/evaluate-quote.dto.js';

const QUOTE_INCLUDE = {
  contractor: { select: { id: true, name: true, tradeType: true } },
  document: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, fullName: true } },
} as const;

function weightedTotal(scores: { weight: number; score: number }[] | null | undefined): number | null {
  if (!scores || scores.length === 0) return null;
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return null;
  return scores.reduce((sum, s) => sum + s.weight * s.score, 0) / totalWeight;
}

function withComputedTotal<T extends { evaluationScores: unknown }>(quote: T) {
  const scores = quote.evaluationScores as { weight: number; score: number }[] | null;
  return { ...quote, evaluationTotal: weightedTotal(scores) };
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async getRfqInProject(projectId: string, rfqId: string) {
    const rfq = await this.prisma.rfq.findFirst({ where: { id: rfqId, projectId } });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  /** Mirrors RfqsService.scopeToOwnContractor - an external CONTRACTOR-
   * role member only ever sees their own quote on this RFQ. */
  private async resolveExternalContractor(projectId: string, callerId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (!user || user.accountType !== 'EXTERNAL') return null;
    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId: callerId } });
    return member?.contractorId ?? null;
  }

  async findAll(projectId: string, rfqId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getRfqInProject(projectId, rfqId);
    const scopeContractorId = await this.resolveExternalContractor(projectId, ownerId);
    const quotes = await this.prisma.quote.findMany({
      where: { rfqId, ...(scopeContractorId ? { contractorId: scopeContractorId } : {}) },
      include: QUOTE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return quotes.map(withComputedTotal);
  }

  async create(projectId: string, rfqId: string, ownerId: string, dto: CreateQuoteDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const rfq = await this.getRfqInProject(projectId, rfqId);

    const scopeContractorId = await this.resolveExternalContractor(projectId, ownerId);
    const contractorId = scopeContractorId ?? dto.contractorId;
    if (!contractorId) throw new BadRequestException('contractorId is required');

    const invited = await this.prisma.rfqInvitation.findUnique({
      where: { rfqId_contractorId: { rfqId, contractorId } },
    });
    if (!invited) throw new ForbiddenException('This vendor was not invited to this RFQ');

    if (dto.documentId) {
      const doc = await this.prisma.projectDocument.findFirst({ where: { id: dto.documentId, projectId } });
      if (!doc) throw new BadRequestException('Document not found in this project');
    }

    const quote = await this.prisma.quote.create({
      data: {
        rfqId: rfq.id,
        contractorId,
        price: dto.price,
        currency: dto.currency,
        leadTimeDays: dto.leadTimeDays,
        warrantyTerms: dto.warrantyTerms,
        commercialTerms: dto.commercialTerms,
        technicalProposal: dto.technicalProposal,
        documentId: dto.documentId,
        submittedById: ownerId,
      },
      include: QUOTE_INCLUDE,
    });
    return withComputedTotal(quote);
  }

  private async getOwnedQuote(projectId: string, rfqId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, rfqId }, include: QUOTE_INCLUDE });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async update(projectId: string, rfqId: string, ownerId: string, id: string, dto: UpdateQuoteDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getRfqInProject(projectId, rfqId);
    await this.getOwnedQuote(projectId, rfqId, id);
    if (dto.documentId) {
      const doc = await this.prisma.projectDocument.findFirst({ where: { id: dto.documentId, projectId } });
      if (!doc) throw new BadRequestException('Document not found in this project');
    }

    await this.prisma.quote.update({
      where: { id },
      data: {
        price: dto.price,
        currency: dto.currency,
        leadTimeDays: dto.leadTimeDays,
        warrantyTerms: dto.warrantyTerms,
        commercialTerms: dto.commercialTerms,
        technicalProposal: dto.technicalProposal,
        documentId: dto.documentId === undefined ? undefined : dto.documentId,
      },
    });
    return withComputedTotal(await this.getOwnedQuote(projectId, rfqId, id));
  }

  async evaluate(projectId: string, rfqId: string, ownerId: string, id: string, dto: EvaluateQuoteDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getRfqInProject(projectId, rfqId);
    await this.getOwnedQuote(projectId, rfqId, id);

    await this.prisma.quote.update({ where: { id }, data: { evaluationScores: dto.scores as unknown as Prisma.InputJsonValue } });
    return withComputedTotal(await this.getOwnedQuote(projectId, rfqId, id));
  }

  async remove(projectId: string, rfqId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getRfqInProject(projectId, rfqId);
    await this.getOwnedQuote(projectId, rfqId, id);
    await this.prisma.quote.delete({ where: { id } });
  }
}
