import { ForbiddenException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { seesProjectMoney } from '../common/setjeka-team.js';
import { assertMayChange, editRights, ownRight, setKeys } from '../common/own-record.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateRfiDto } from './dto/create-rfi.dto.js';
import type { UpdateRfiDto } from './dto/update-rfi.dto.js';
import type { RespondRfiDto } from './dto/respond-rfi.dto.js';

const MEMBER_SELECT = { id: true, externalName: true, user: { select: { id: true, fullName: true } } } as const;

const RFI_INCLUDE = {
  raisedBy: { select: MEMBER_SELECT },
  assignedTo: { select: MEMBER_SELECT },
  ballInCourt: { select: MEMBER_SELECT },
  document: { select: { id: true, name: true } },
} as const;

@Injectable()
export class RfisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async nextRfiNumber(projectId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RFI-${year}-`;
    const latest = await this.prisma.rfi.findFirst({
      where: { projectId, rfiNumber: { startsWith: prefix } },
      orderBy: { rfiNumber: 'desc' },
      select: { rfiNumber: true },
    });
    let nextSeq = 1;
    if (latest?.rfiNumber) {
      const seq = Number.parseInt(latest.rfiNumber.slice(prefix.length), 10);
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
    return this.forViewer(projectId, ownerId, await this.prisma.rfi.findMany({ where: { projectId }, include: RFI_INCLUDE, orderBy: { createdAt: 'desc' } }));
  }

  /** An RFI's cost impact is money (critique V3-M-04): Setjeka, the client
   * and the QS see it, and whoever raised the RFI sees their own figure. */
  async forViewer<T extends { costImpactPotential: number | null; costImpactConfirmed: number | null; createdByUserId: string | null }>(projectId: string, userId: string, rows: T[]): Promise<T[]> {
    if (await seesProjectMoney(this.prisma, projectId, userId)) return rows;
    return rows.map((r) => (r.createdByUserId === userId ? r : { ...r, costImpactPotential: null, costImpactConfirmed: null }));
  }

  async forViewerOne<T extends { costImpactPotential: number | null; costImpactConfirmed: number | null; createdByUserId: string | null }>(projectId: string, userId: string, row: T): Promise<T> {
    return (await this.forViewer(projectId, userId, [row]))[0];
  }

  async create(projectId: string, ownerId: string, dto: CreateRfiDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    // An outside party raises an RFI as themselves, never as someone else
    // (critique V3-H-01).
    const rights = await editRights(this.prisma, projectId, ownerId);
    if (!rights.internal) dto.raisedById = rights.selfMemberId ?? undefined;
    if (dto.raisedById) await this.assertMemberInProject(dto.raisedById, projectId);
    if (dto.assignedToId) await this.assertMemberInProject(dto.assignedToId, projectId);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);

    const rfiNumber = await this.nextRfiNumber(projectId);
    const rfi = await this.prisma.rfi.create({
      data: {
        projectId,
        rfiNumber,
        title: dto.title,
        question: dto.question,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        raisedById: dto.raisedById,
        createdByUserId: ownerId,
        assignedToId: dto.assignedToId,
        // Whoever's assigned starts with the ball in their court — it's
        // their turn to respond.
        ballInCourtId: dto.assignedToId,
        documentId: dto.documentId,
        costImpactPotential: dto.costImpactPotential,
        costImpactConfirmed: dto.costImpactConfirmed,
        scheduleImpactPotentialDays: dto.scheduleImpactPotentialDays,
        scheduleImpactConfirmedDays: dto.scheduleImpactConfirmedDays,
      },
    });

    await this.notifyBallInCourt(projectId, rfi.id, rfi.title, dto.assignedToId);
    if (dto.costImpactPotential || dto.costImpactConfirmed) await this.notifyQs(projectId, rfi.id, rfi.rfiNumber, rfi.title, dto.costImpactConfirmed ?? dto.costImpactPotential!, Boolean(dto.costImpactConfirmed));

    return this.getOne(projectId, rfi.id);
  }

  /** An RFI that carries a cost brings the quantity surveyor in (Feature
   * Register Review: "the QS also needs to be involved"). */
  private async notifyQs(projectId: string, rfiId: string, rfiNumber: string, title: string, amount: number, confirmed: boolean) {
    const qs = await this.prisma.projectMember.findMany({ where: { projectId, role: 'QUANTITY_SURVEYOR', userId: { not: null } }, select: { userId: true } });
    for (const userId of new Set(qs.map((m) => m.userId))) {
      await this.notifications.notify({
        userId,
        projectId,
        type: 'RFI_COST_IMPACT',
        entityType: 'RFI',
        entityId: rfiId,
        message: `${rfiNumber} "${title}" has a ${confirmed ? 'confirmed' : 'potential'} cost impact of ${(await this.prisma.project.findUnique({ where: { id: projectId }, select: { currency: true } }))?.currency ?? ''} ${amount.toLocaleString('en-GB')}: please assess it`,
      });
    }
  }

  private async notifyBallInCourt(projectId: string, rfiId: string, title: string, memberId: string | null | undefined) {
    if (!memberId) return;
    const member = await this.prisma.projectMember.findUnique({ where: { id: memberId } });
    await this.notifications.notify({
      userId: member?.userId,
      projectId,
      type: 'RFI_BALL_IN_COURT',
      entityType: 'RFI',
      entityId: rfiId,
      message: `The ball is in your court on RFI "${title}"`,
    });
  }

  async getOne(projectId: string, id: string) {
    const rfi = await this.prisma.rfi.findFirst({ where: { id, projectId }, include: RFI_INCLUDE });
    if (!rfi) throw new NotFoundException('RFI not found');
    return rfi;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateRfiDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    const rights = await editRights(this.prisma, projectId, ownerId);
    if (!rights.internal) delete dto.raisedById;
    const right = ownRight(rights, ownerId, { createdByUserId: existing.createdByUserId, raisedMemberId: existing.raisedById, assigneeMemberIds: [existing.assignedToId, existing.ballInCourtId] });
    assertMayChange(right, setKeys(dto), ['status'], 'RFI');
    if (dto.raisedById) await this.assertMemberInProject(dto.raisedById, projectId);
    if (dto.assignedToId) await this.assertMemberInProject(dto.assignedToId, projectId);
    if (dto.documentId) await this.assertDocumentInProject(dto.documentId, projectId);

    // Reassigning to someone new moves the ball to them — an open RFI's
    // assignee is always whoever needs to act next.
    const reassigned = dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedTo?.id;
    const nextBallInCourtId = reassigned ? dto.assignedToId : undefined;

    await this.prisma.rfi.update({
      where: { id },
      data: {
        title: dto.title,
        question: dto.question,
        priority: dto.priority,
        status: dto.status,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        raisedById: dto.raisedById === undefined ? undefined : dto.raisedById,
        assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
        ballInCourtId: nextBallInCourtId,
        documentId: dto.documentId === undefined ? undefined : dto.documentId,
        costImpactPotential: dto.costImpactPotential,
        costImpactConfirmed: dto.costImpactConfirmed,
        scheduleImpactPotentialDays: dto.scheduleImpactPotentialDays,
        scheduleImpactConfirmedDays: dto.scheduleImpactConfirmedDays,
      },
    });

    if (reassigned) await this.notifyBallInCourt(projectId, id, dto.title ?? existing.title, nextBallInCourtId);
    const costNow = dto.costImpactConfirmed ?? dto.costImpactPotential;
    const costChanged = (dto.costImpactConfirmed !== undefined && dto.costImpactConfirmed !== existing.costImpactConfirmed) || (dto.costImpactPotential !== undefined && dto.costImpactPotential !== existing.costImpactPotential);
    if (costNow && costChanged) await this.notifyQs(projectId, id, existing.rfiNumber, dto.title ?? existing.title, costNow, dto.costImpactConfirmed != null);

    return this.getOne(projectId, id);
  }

  async respond(projectId: string, ownerId: string, id: string, dto: RespondRfiDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.getOne(projectId, id);
    // The answer comes from whoever the RFI is with, or Setjeka.
    const rights = await editRights(this.prisma, projectId, ownerId);
    if (!rights.internal && ![existing.assignedToId, existing.ballInCourtId].some((m) => m && rights.memberIds.has(m))) {
      throw new ForbiddenException('The person this RFI is assigned to, or Setjeka, answers it');
    }

    await this.prisma.rfi.update({
      where: { id },
      data: {
        officialResponse: dto.officialResponse,
        respondedAt: new Date(),
        status: 'ANSWERED',
        // The raiser now has the ball — it's their turn to review the
        // response and close the RFI.
        ballInCourtId: existing.raisedBy?.id,
      },
    });

    await this.notifyBallInCourt(projectId, id, existing.title, existing.raisedBy?.id);

    return this.getOne(projectId, id);
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.rfi.delete({ where: { id } });
  }
}
