import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateRfqDto } from './dto/create-rfq.dto.js';
import type { UpdateRfqDto } from './dto/update-rfq.dto.js';
import type { InviteVendorDto } from './dto/invite-vendor.dto.js';
import type { CreateRfqItemDto, UpdateRfqItemDto } from './dto/rfq-item.dto.js';
import { CostDatabaseService } from '../cost-database/cost-database.service.js';

const RFQ_INCLUDE = {
  document: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  invitations: { include: { contractor: { select: { id: true, name: true, tradeType: true } } } },
  quotes: { select: { id: true, contractorId: true, price: true, currency: true, status: true, items: { select: { rfqItemId: true, unitRate: true } } } },
  costRegion: { select: { id: true, name: true, currency: true } },
  items: { include: { resource: { select: { id: true, code: true, name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
} as const;

/** rfqNumber is unique across the whole table, so the sequence must be
 * global too - shared by project RFQs and opportunity (Stage 0) RFQs. */
export async function nextRfqNumber(prisma: PrismaService): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RFQ-${year}-`;
  const latest = await prisma.rfq.findFirst({
    where: { rfqNumber: { startsWith: prefix } },
    orderBy: { rfqNumber: 'desc' },
    select: { rfqNumber: true },
  });
  let nextSeq = 1;
  if (latest?.rfqNumber) {
    const seq = Number.parseInt(latest.rfqNumber.slice(prefix.length), 10);
    if (Number.isFinite(seq)) nextSeq = seq + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

@Injectable()
export class RfqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly costs: CostDatabaseService,
  ) {}

  /** Vendor Portal: an external CONTRACTOR-role member only sees RFQs
   * they were actually invited to, never the whole project's list -
   * internal users are unaffected. Returns their contractorId, or null
   * if the caller isn't a scoped external vendor. */
  private async scopeToOwnContractor(projectId: string, callerId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (!user || user.accountType !== 'EXTERNAL') return null;
    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId: callerId } });
    return member?.contractorId ?? null;
  }

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const scopeContractorId = await this.scopeToOwnContractor(projectId, ownerId);
    // Consultant RFQs (those with a discipline) live in Inception →
    // Professional team, with their own ranking; this list is works/supply.
    return this.prisma.rfq.findMany({
      where: { projectId, discipline: null, ...(scopeContractorId ? { invitations: { some: { contractorId: scopeContractorId } } } : {}) },
      include: RFQ_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(projectId: string, ownerId: string, dto: CreateRfqDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.costRegionId) await this.costs.getRegion(dto.costRegionId);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);

    const rfqNumber = await nextRfqNumber(this.prisma);
    const rfq = await this.prisma.rfq.create({
      data: {
        projectId,
        rfqNumber,
        title: dto.title,
        scopeDescription: dto.scopeDescription,
        documentId: dto.documentId,
        costRegionId: dto.costRegionId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        createdById: ownerId,
      },
      include: RFQ_INCLUDE,
    });
    return rfq;
  }

  private async assertDocumentInProject(documentId: string, projectId: string) {
    const found = await this.prisma.projectDocument.findFirst({ where: { id: documentId, projectId } });
    if (!found) throw new BadRequestException('Document not found in this project');
  }

  async getOne(projectId: string, id: string) {
    const rfq = await this.prisma.rfq.findFirst({ where: { id, projectId }, include: RFQ_INCLUDE });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateRfqDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);
    if (dto.costRegionId) await this.costs.getRegion(dto.costRegionId);

    await this.prisma.rfq.update({
      where: { id },
      data: {
        title: dto.title,
        scopeDescription: dto.scopeDescription,
        documentId: dto.documentId === undefined ? undefined : dto.documentId,
        costRegionId: dto.costRegionId === undefined ? undefined : dto.costRegionId,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
    return this.getOne(projectId, id);
  }

  async invite(projectId: string, ownerId: string, id: string, dto: InviteVendorDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const rfq = await this.getOne(projectId, id);
    const contractor = await this.prisma.contractor.findUnique({ where: { id: dto.contractorId } });
    if (!contractor) throw new BadRequestException('Contractor not found');

    const existing = await this.prisma.rfqInvitation.findUnique({
      where: { rfqId_contractorId: { rfqId: rfq.id, contractorId: dto.contractorId } },
    });
    if (existing) throw new BadRequestException('This vendor has already been invited');

    await this.prisma.rfqInvitation.create({ data: { rfqId: rfq.id, contractorId: dto.contractorId } });
    return this.getOne(projectId, id);
  }

  async issue(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const rfq = await this.getOne(projectId, id);
    if (rfq.status !== 'DRAFT') throw new BadRequestException('Only a draft RFQ can be issued');
    await this.prisma.rfq.update({ where: { id }, data: { status: 'ISSUED' } });
    return this.getOne(projectId, id);
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.rfq.delete({ where: { id } });
  }

  // ---- Priced items -----------------------------------------------------

  private async draftRfq(projectId: string, id: string) {
    const rfq = await this.getOne(projectId, id);
    if (rfq.status !== 'DRAFT') throw new BadRequestException('Items are fixed once the RFQ is issued - vendors have priced them');
    return rfq;
  }

  async addItem(projectId: string, id: string, dto: CreateRfqItemDto) {
    const rfq = await this.draftRfq(projectId, id);
    let { description, unit } = dto;
    if (dto.resourceId) {
      const r = await this.prisma.costResource.findUnique({ where: { id: dto.resourceId } });
      if (!r) throw new BadRequestException('Resource not found');
      description ||= r.name;
      unit = r.unit;
    }
    if (!description || !unit) throw new BadRequestException('Describe the item and its unit, or pick it from the cost database');
    await this.prisma.rfqItem.create({ data: { rfqId: rfq.id, resourceId: dto.resourceId, description, unit, quantity: dto.quantity, sortOrder: rfq.items.length * 10 } });
    return this.getOne(projectId, id);
  }

  async updateItem(projectId: string, id: string, itemId: string, dto: UpdateRfqItemDto) {
    const rfq = await this.draftRfq(projectId, id);
    if (!rfq.items.some((i) => i.id === itemId)) throw new NotFoundException('Item not found');
    await this.prisma.rfqItem.update({ where: { id: itemId }, data: dto });
    return this.getOne(projectId, id);
  }

  async removeItem(projectId: string, id: string, itemId: string) {
    const rfq = await this.draftRfq(projectId, id);
    if (!rfq.items.some((i) => i.id === itemId)) throw new NotFoundException('Item not found');
    await this.prisma.rfqItem.delete({ where: { id: itemId } });
    return this.getOne(projectId, id);
  }

  /** Award a works/supply RFQ to one quote. With a cost region set, the
   * winning item rates go straight into that region's price sheet. */
  async award(projectId: string, id: string, userId: string, quoteId: string) {
    const rfq = await this.getOne(projectId, id);
    if (rfq.status !== 'ISSUED' && rfq.status !== 'CLOSED') throw new BadRequestException('Only an issued or closed RFQ can be awarded');
    const quote = rfq.quotes.find((q) => q.id === quoteId);
    if (!quote || quote.status !== 'SUBMITTED') throw new BadRequestException('Choose a live quote on this RFQ');
    await this.prisma.rfq.update({ where: { id }, data: { status: 'AWARDED', awardedQuoteId: quoteId, awardedAt: new Date() } });
    const priceUpdate = rfq.costRegionId && quote.items.length ? await this.costs.applyQuoteRates(id, quoteId, userId) : null;
    return { rfq: await this.getOne(projectId, id), priceUpdate };
  }

  /** Re-apply the awarded quote's rates (e.g. after an exchange rate was
   * added for items that were skipped). Price sheets only ever take rates
   * from an awarded quote - never from quotes that did not win. */
  async reapplyAwardedPrices(projectId: string, id: string, userId: string) {
    const rfq = await this.getOne(projectId, id);
    if (rfq.status !== 'AWARDED' || !rfq.awardedQuoteId) throw new BadRequestException('Award the RFQ first; the price sheet is updated from the awarded quote');
    const priceUpdate = await this.costs.applyQuoteRates(id, rfq.awardedQuoteId, userId);
    return { rfq: await this.getOne(projectId, id), priceUpdate };
  }
}
