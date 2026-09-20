import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreatePurchaseOrderDto } from './dto/create-po.dto.js';
import type { UpdatePurchaseOrderDto } from './dto/update-po.dto.js';
import type { ChangePurchaseOrderStatusDto } from './dto/change-po-status.dto.js';

const PO_INCLUDE = {
  contractor: { select: { id: true, name: true, tradeType: true } },
  quote: { select: { id: true, price: true, currency: true } },
  appointment: { select: { id: true, appointmentReference: true } },
} as const;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async nextPoNumber(projectId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const latest = await this.prisma.purchaseOrder.findFirst({
      where: { projectId, poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
      select: { poNumber: true },
    });
    let nextSeq = 1;
    if (latest?.poNumber) {
      const seq = Number.parseInt(latest.poNumber.slice(prefix.length), 10);
      if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /** Vendor Portal: mirrors RfqsService.scopeToOwnContractor. */
  private async scopeToOwnContractor(projectId: string, callerId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (!user || user.accountType !== 'EXTERNAL') return null;
    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId: callerId } });
    return member?.contractorId ?? null;
  }

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const scopeContractorId = await this.scopeToOwnContractor(projectId, ownerId);
    return this.prisma.purchaseOrder.findMany({
      where: { projectId, ...(scopeContractorId ? { contractorId: scopeContractorId } : {}) },
      include: PO_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(projectId: string, ownerId: string, dto: CreatePurchaseOrderDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);

    const contractor = await this.prisma.contractor.findUnique({ where: { id: dto.contractorId } });
    if (!contractor) throw new BadRequestException('Contractor not found');
    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({ where: { id: dto.quoteId, rfq: { projectId } } });
      if (!quote) throw new BadRequestException('Quote not found in this project');
    }
    if (dto.appointmentId) {
      const appointment = await this.prisma.organisationProjectAppointment.findFirst({ where: { id: dto.appointmentId, projectId } });
      if (!appointment) throw new BadRequestException('Appointment not found for this project');
    }

    const poNumber = await this.nextPoNumber(projectId);
    const po = await this.prisma.purchaseOrder.create({
      data: {
        projectId,
        poNumber,
        contractorId: dto.contractorId,
        quoteId: dto.quoteId,
        appointmentId: dto.appointmentId,
        costCode: dto.costCode,
        scopeDescription: dto.scopeDescription,
        value: dto.value,
        currency: dto.currency,
      },
      include: PO_INCLUDE,
    });
    return po;
  }

  async getOne(projectId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, projectId }, include: PO_INCLUDE });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdatePurchaseOrderDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { costCode: dto.costCode, scopeDescription: dto.scopeDescription, value: dto.value, currency: dto.currency },
    });
    return this.getOne(projectId, id);
  }

  // Every status change writes a PurchaseOrderStatusHistory row in the
  // same transaction - mirrors SubmittalsService.changeStatus exactly.
  async changeStatus(projectId: string, ownerId: string, id: string, changedById: string, dto: ChangePurchaseOrderStatusDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    if (dto.status === existing.status) return existing;

    await this.prisma.$transaction([
      this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: dto.status, issuedAt: dto.status === 'ISSUED' ? new Date() : undefined },
      }),
      this.prisma.purchaseOrderStatusHistory.create({
        data: { purchaseOrderId: id, previousStatus: existing.status, newStatus: dto.status, changedById, comment: dto.comment },
      }),
    ]);

    return this.getOne(projectId, id);
  }

  async getHistory(projectId: string, id: string) {
    await this.getOne(projectId, id);
    return this.prisma.purchaseOrderStatusHistory.findMany({
      where: { purchaseOrderId: id },
      include: { changedBy: { select: { id: true, fullName: true } } },
      orderBy: { changedAt: 'asc' },
    });
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.purchaseOrder.delete({ where: { id } });
  }
}
