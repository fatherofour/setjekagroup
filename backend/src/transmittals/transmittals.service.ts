import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateTransmittalDto } from './dto/create-transmittal.dto.js';

const TRANSMITTAL_INCLUDE = {
  fromMember: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } },
  createdBy: { select: { id: true, fullName: true } },
  recipients: { include: { member: { select: { id: true, externalName: true, user: { select: { id: true, fullName: true } } } } } },
  items: { include: { documentRevision: { include: { document: { select: { id: true, name: true } } } } } },
} as const;

@Injectable()
export class TransmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async nextTransmittalNumber(projectId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TR-${year}-`;
    const latest = await this.prisma.transmittal.findFirst({
      where: { projectId, transmittalNumber: { startsWith: prefix } },
      orderBy: { transmittalNumber: 'desc' },
      select: { transmittalNumber: true },
    });
    let nextSeq = 1;
    if (latest?.transmittalNumber) {
      const seq = Number.parseInt(latest.transmittalNumber.slice(prefix.length), 10);
      if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.transmittal.findMany({ where: { projectId }, include: TRANSMITTAL_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(projectId: string, ownerId: string, userId: string, dto: CreateTransmittalDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);

    if (dto.fromMemberId) {
      const found = await this.prisma.projectMember.findFirst({ where: { id: dto.fromMemberId, projectId } });
      if (!found) throw new BadRequestException('Sender not found in this project');
    }
    for (const memberId of dto.recipientMemberIds ?? []) {
      const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
      if (!found) throw new BadRequestException('Recipient not found in this project');
    }
    for (const revisionId of dto.documentRevisionIds) {
      const found = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, document: { projectId } } });
      if (!found) throw new BadRequestException('One or more documents were not found in this project');
    }

    const transmittalNumber = await this.nextTransmittalNumber(projectId);
    const transmittal = await this.prisma.transmittal.create({
      data: {
        projectId,
        transmittalNumber,
        purpose: dto.purpose,
        fromMemberId: dto.fromMemberId,
        createdById: userId,
        recipients: { create: (dto.recipientMemberIds ?? []).map((memberId) => ({ memberId })) },
        items: { create: dto.documentRevisionIds.map((documentRevisionId) => ({ documentRevisionId })) },
      },
      include: TRANSMITTAL_INCLUDE,
    });
    return transmittal;
  }

  private async findOwned(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const transmittal = await this.prisma.transmittal.findFirst({ where: { id, projectId } });
    if (!transmittal) throw new NotFoundException('Transmittal not found');
    return transmittal;
  }

  async issue(projectId: string, ownerId: string, id: string) {
    const transmittal = await this.findOwned(projectId, ownerId, id);
    if (transmittal.status === 'ISSUED') throw new BadRequestException('This transmittal has already been issued');
    await this.prisma.transmittal.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } });
    return this.prisma.transmittal.findFirst({ where: { id }, include: TRANSMITTAL_INCLUDE });
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.findOwned(projectId, ownerId, id);
    await this.prisma.transmittal.delete({ where: { id } });
  }
}
