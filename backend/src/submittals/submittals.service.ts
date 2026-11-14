import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMayChange, editRights, ownRight, setKeys } from '../common/own-record.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateSubmittalDto } from './dto/create-submittal.dto.js';
import type { UpdateSubmittalDto } from './dto/update-submittal.dto.js';
import type { ChangeSubmittalStatusDto } from './dto/change-status.dto.js';

const MEMBER_SELECT = { id: true, externalName: true, user: { select: { id: true, fullName: true } } } as const;

const SUBMITTAL_INCLUDE = {
  submittedBy: { select: MEMBER_SELECT },
  reviewer: { select: MEMBER_SELECT },
  document: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SubmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async nextSubmittalNumber(projectId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SUB-${year}-`;
    const latest = await this.prisma.submittal.findFirst({
      where: { projectId, submittalNumber: { startsWith: prefix } },
      orderBy: { submittalNumber: 'desc' },
      select: { submittalNumber: true },
    });
    let nextSeq = 1;
    if (latest?.submittalNumber) {
      const seq = Number.parseInt(latest.submittalNumber.slice(prefix.length), 10);
      if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  private async assertMemberInProject(memberId: string, projectId: string) {
    const found = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!found) throw new BadRequestException('Team member not found in this project');
  }

  private async assertDocumentInProject(documentId: string, projectId: string) {
    const found = await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: documentId, projectId } });
    if (!found) throw new BadRequestException('Document not found in this project');
  }

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.submittal.findMany({ where: { projectId }, include: SUBMITTAL_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(projectId: string, ownerId: string, dto: CreateSubmittalDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    // An outside party submits as themselves (critique V3-H-01).
    const rights = await editRights(this.prisma, projectId, ownerId);
    if (!rights.internal) dto.submittedById = rights.selfMemberId ?? undefined;
    if (dto.submittedById) await this.assertMemberInProject(dto.submittedById, projectId);
    if (dto.reviewerId) await this.assertMemberInProject(dto.reviewerId, projectId);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);

    const submittalNumber = await this.nextSubmittalNumber(projectId);
    const submittal = await this.prisma.submittal.create({
      data: {
        projectId,
        submittalNumber,
        title: dto.title,
        specSection: dto.specSection,
        submittalType: dto.submittalType,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        submittedById: dto.submittedById,
        createdByUserId: ownerId,
        reviewerId: dto.reviewerId,
        documentId: dto.documentId,
      },
    });
    return this.getOne(projectId, submittal.id);
  }

  async getOne(projectId: string, id: string) {
    const submittal = await this.prisma.submittal.findFirst({ where: { id, projectId }, include: SUBMITTAL_INCLUDE });
    if (!submittal) throw new NotFoundException('Submittal not found');
    return submittal;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateSubmittalDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    const rights = await editRights(this.prisma, projectId, ownerId);
    if (!rights.internal) delete dto.submittedById;
    assertMayChange(ownRight(rights, ownerId, { createdByUserId: existing.createdByUserId, raisedMemberId: existing.submittedById }), setKeys(dto), [], 'submittal');
    if (dto.submittedById) await this.assertMemberInProject(dto.submittedById, projectId);
    if (dto.reviewerId) await this.assertMemberInProject(dto.reviewerId, projectId);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);

    await this.prisma.submittal.update({
      where: { id },
      data: {
        title: dto.title,
        specSection: dto.specSection,
        submittalType: dto.submittalType,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        submittedById: dto.submittedById === undefined ? undefined : dto.submittedById,
        reviewerId: dto.reviewerId === undefined ? undefined : dto.reviewerId,
        documentId: dto.documentId === undefined ? undefined : dto.documentId,
      },
    });
    return this.getOne(projectId, id);
  }

  // Every status change writes a SubmittalStatusHistory row in the same
  // transaction — mirrors ContractorsService.updateStatus's existing
  // OrganisationStatusHistory pattern exactly.
  async changeStatus(projectId: string, ownerId: string, id: string, changedById: string, dto: ChangeSubmittalStatusDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    // Its submitter moves it along; its reviewer decides it; or Setjeka.
    assertMayChange(ownRight(await editRights(this.prisma, projectId, ownerId), ownerId, { createdByUserId: existing.createdByUserId, raisedMemberId: existing.submittedById, assigneeMemberIds: [existing.reviewerId] }), ['status'], ['status'], 'submittal');
    if (dto.status === existing.status) return existing;

    await this.prisma.$transaction([
      this.prisma.submittal.update({ where: { id }, data: { status: dto.status } }),
      this.prisma.submittalStatusHistory.create({
        data: {
          submittalId: id,
          previousStatus: existing.status,
          newStatus: dto.status,
          changedById,
          comment: dto.comment,
        },
      }),
    ]);

    if (existing.submittedBy) {
      await this.notifications.notify({
        userId: existing.submittedBy.user?.id,
        projectId,
        type: 'SUBMITTAL_STATUS_CHANGED',
        entityType: 'SUBMITTAL',
        entityId: id,
        message: `Submittal "${existing.title}" is now ${dto.status.replace(/_/g, ' ').toLowerCase()}`,
      });
    }

    return this.getOne(projectId, id);
  }

  async getHistory(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    return this.prisma.submittalStatusHistory.findMany({
      where: { submittalId: id },
      include: { changedBy: { select: { id: true, fullName: true } } },
      orderBy: { changedAt: 'asc' },
    });
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    assertMayChange(ownRight(await editRights(this.prisma, projectId, ownerId), ownerId, { createdByUserId: existing.createdByUserId, raisedMemberId: existing.submittedById }), ['delete'], [], 'submittal');
    await this.prisma.submittal.delete({ where: { id } });
  }
}
