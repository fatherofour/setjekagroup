import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { CreateTransmittalDto } from './dto/create-transmittal.dto.js';
import { transmittalPdf } from './transmittal-pdf.js';

const PURPOSE: Record<string, string> = {
  FOR_INFORMATION: 'Information',
  FOR_COMMENT: 'Comment',
  FOR_COORDINATION: 'Co-ordination',
  FOR_CLIENT_APPROVAL: 'Client approval',
  FOR_AUTHORITY_SUBMISSION: 'Authority submission',
  FOR_PROCUREMENT: 'Procurement',
  FOR_CONSTRUCTION: 'Construction',
  AS_BUILT: 'As built',
};

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
    private readonly permissions: PermissionsService,
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

    // An outside party's transmittal is from them, whether or not the form says so.
    if (!dto.fromMemberId) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, accountType: true } });
      if (user.role !== 'ADMIN' && user.accountType !== 'INTERNAL') {
        const mine = await this.prisma.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } });
        if (mine) dto.fromMemberId = mine.id;
      }
    }
    if (dto.fromMemberId) {
      const found = await this.prisma.projectMember.findFirst({ where: { id: dto.fromMemberId, projectId } });
      if (!found) throw new BadRequestException('Sender not found in this project');
      // Outside parties send only as themselves.
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, accountType: true } });
      if (user.role !== 'ADMIN' && user.accountType !== 'INTERNAL' && found.userId !== userId) throw new ForbiddenException('You can only send a transmittal as yourself');
    }
    // Distribution lists expand to their members.
    if (dto.distributionListIds?.length) {
      const lists = await this.prisma.distributionList.findMany({ where: { projectId, id: { in: dto.distributionListIds } }, include: { members: { select: { projectMemberId: true } } } });
      if (lists.length !== new Set(dto.distributionListIds).size) throw new BadRequestException('Distribution list not found in this project');
      dto.recipientMemberIds = [...new Set([...(dto.recipientMemberIds ?? []), ...lists.flatMap((l) => l.members.map((m) => m.projectMemberId))])];
    }
    for (const memberId of dto.recipientMemberIds ?? []) {
      const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
      if (!found) throw new BadRequestException('Recipient not found in this project');
    }
    for (const revisionId of dto.documentRevisionIds) {
      const found = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, document: { projectId, deletedAt: null } } });
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

  // Whoever approves transmittals issues any of them; a consultant issues the
  // ones sent from them (the architect issues their own drawings).
  async issue(projectId: string, ownerId: string, id: string) {
    const transmittal = await this.findOwned(projectId, ownerId, id);
    if (transmittal.status === 'ISSUED') throw new BadRequestException('This transmittal has already been issued');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { role: true, accountType: true } });
    if (!(await this.permissions.can(user.role, user.accountType, ownerId, projectId, 'TRANSMITTALS', 'APPROVE'))) {
      const from = transmittal.fromMemberId ? await this.prisma.projectMember.findUnique({ where: { id: transmittal.fromMemberId }, select: { userId: true } }) : null;
      if (from?.userId !== ownerId) throw new ForbiddenException('Only Setjeka, or whoever it is sent from, issues a transmittal');
    }
    await this.prisma.transmittal.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } });
    return this.prisma.transmittal.findFirst({ where: { id }, include: TRANSMITTAL_INCLUDE });
  }

  /** The transmittal slip as a PDF. */
  async pdf(projectId: string, ownerId: string, id: string) {
    await this.findOwned(projectId, ownerId, id);
    const t = await this.prisma.transmittal.findFirstOrThrow({
      where: { id },
      include: {
        project: { select: { name: true, projectCode: true } },
        createdBy: { select: { fullName: true } },
        fromMember: { select: { externalName: true, user: { select: { fullName: true } } } },
        recipients: { include: { member: { select: { role: true, externalName: true, externalCompany: true, user: { select: { fullName: true } }, contractor: { select: { name: true } } } } } },
        items: { include: { documentRevision: { select: { revisionNumber: true, purpose: true, originalFilename: true, document: { select: { name: true, drawingNumber: true } } } } } },
      },
    });
    const role = (r: string) => r.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    const bytes = await transmittalPdf({
      number: t.transmittalNumber,
      projectName: t.project.name,
      projectCode: t.project.projectCode,
      issuedAt: t.issuedAt,
      createdAt: t.createdAt,
      purpose: t.purpose,
      from: t.fromMember ? (t.fromMember.user?.fullName ?? t.fromMember.externalName ?? 'Setjeka Group') : 'Setjeka Group',
      createdBy: t.createdBy.fullName,
      recipients: t.recipients.map((r) => ({ name: r.member.user?.fullName ?? r.member.externalName ?? '—', company: r.member.contractor?.name ?? r.member.externalCompany, role: role(r.member.role) })),
      items: t.items.map((i) => ({
        number: i.documentRevision.document.drawingNumber,
        title: i.documentRevision.document.name,
        revision: i.documentRevision.revisionNumber,
        purpose: i.documentRevision.purpose ? PURPOSE[i.documentRevision.purpose] : null,
        file: i.documentRevision.originalFilename,
      })),
    });
    return { bytes: Buffer.from(bytes), filename: `${t.transmittalNumber}.pdf` };
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.findOwned(projectId, ownerId, id);
    await this.prisma.transmittal.delete({ where: { id } });
  }
}
