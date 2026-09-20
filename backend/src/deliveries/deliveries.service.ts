import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import type { UpdateDeliveryDto } from './dto/update-delivery.dto.js';

const DELIVERY_INCLUDE = {
  acceptedBy: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } },
} as const;

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async getPoInProject(projectId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id: poId, projectId } });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  private async assertMemberInProject(memberId: string, projectId: string) {
    const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!found) throw new BadRequestException('Team member not found in this project');
  }

  /** Vendor Portal: mirrors RfqsService.scopeToOwnContractor - a vendor
   * only sees deliveries against their own purchase orders. */
  private async scopeToOwnContractor(projectId: string, callerId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: callerId } });
    if (!user || user.accountType !== 'EXTERNAL') return null;
    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId: callerId } });
    return member?.contractorId ?? null;
  }

  async findAll(projectId: string, poId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const po = await this.getPoInProject(projectId, poId);
    const scopeContractorId = await this.scopeToOwnContractor(projectId, ownerId);
    if (scopeContractorId && po.contractorId !== scopeContractorId) return [];

    return this.prisma.delivery.findMany({ where: { purchaseOrderId: poId }, include: DELIVERY_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(projectId: string, poId: string, ownerId: string, dto: CreateDeliveryDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getPoInProject(projectId, poId);
    if (dto.acceptedById) await this.assertMemberInProject(dto.acceptedById, projectId);

    return this.prisma.delivery.create({
      data: {
        purchaseOrderId: poId,
        description: dto.description,
        quantityOrdered: dto.quantityOrdered,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        acceptedById: dto.acceptedById,
        notes: dto.notes,
      },
      include: DELIVERY_INCLUDE,
    });
  }

  private async getOwnedDelivery(poId: string, id: string) {
    const delivery = await this.prisma.delivery.findFirst({ where: { id, purchaseOrderId: poId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async update(projectId: string, poId: string, ownerId: string, id: string, dto: UpdateDeliveryDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getPoInProject(projectId, poId);
    await this.getOwnedDelivery(poId, id);
    if (dto.acceptedById) await this.assertMemberInProject(dto.acceptedById, projectId);

    return this.prisma.delivery.update({
      where: { id },
      data: {
        description: dto.description,
        quantityOrdered: dto.quantityOrdered,
        quantityDelivered: dto.quantityDelivered,
        expectedDate: dto.expectedDate === undefined ? undefined : dto.expectedDate ? new Date(dto.expectedDate) : null,
        deliveredDate: dto.deliveredDate === undefined ? undefined : dto.deliveredDate ? new Date(dto.deliveredDate) : null,
        status: dto.status,
        acceptedById: dto.acceptedById === undefined ? undefined : dto.acceptedById,
        notes: dto.notes,
      },
      include: DELIVERY_INCLUDE,
    });
  }

  async remove(projectId: string, poId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getPoInProject(projectId, poId);
    await this.getOwnedDelivery(poId, id);
    await this.prisma.delivery.delete({ where: { id } });
  }
}
