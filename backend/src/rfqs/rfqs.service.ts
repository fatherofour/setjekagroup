import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateRfqDto } from './dto/create-rfq.dto.js';
import type { UpdateRfqDto } from './dto/update-rfq.dto.js';
import type { InviteVendorDto } from './dto/invite-vendor.dto.js';

const RFQ_INCLUDE = {
  document: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  invitations: { include: { contractor: { select: { id: true, name: true, tradeType: true } } } },
  quotes: { select: { id: true, contractorId: true, price: true, currency: true, status: true } },
} as const;

@Injectable()
export class RfqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async nextRfqNumber(projectId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RFQ-${year}-`;
    const latest = await this.prisma.rfq.findFirst({
      where: { projectId, rfqNumber: { startsWith: prefix } },
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
    return this.prisma.rfq.findMany({
      where: { projectId, ...(scopeContractorId ? { invitations: { some: { contractorId: scopeContractorId } } } : {}) },
      include: RFQ_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(projectId: string, ownerId: string, dto: CreateRfqDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);

    const rfqNumber = await this.nextRfqNumber(projectId);
    const rfq = await this.prisma.rfq.create({
      data: {
        projectId,
        rfqNumber,
        title: dto.title,
        scopeDescription: dto.scopeDescription,
        documentId: dto.documentId,
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

    await this.prisma.rfq.update({
      where: { id },
      data: {
        title: dto.title,
        scopeDescription: dto.scopeDescription,
        documentId: dto.documentId === undefined ? undefined : dto.documentId,
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
}
