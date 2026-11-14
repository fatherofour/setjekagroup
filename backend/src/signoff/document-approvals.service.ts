import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { uploadRootDir } from '../project-documents/upload.util.js';
import { SignoffService, type RequestMeta } from './signoff.service.js';
import { OUTCOME_LABEL, isApproval, resolveOutcome, responseDue, type DecisionDto } from './dto/decision.dto.js';
import { formatDay } from '../common/dates.js';

const INCLUDE = {
  revision: {
    select: {
      id: true,
      revisionNumber: true,
      originalFilename: true,
      mimeType: true,
      uploadedAt: true,
      document: { select: { id: true, name: true, documentType: true, discipline: true } },
    },
  },
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
} as const;

/** A drawing or document sent to the client for approval (App Review, 17
 * Oct 2026). The client alone decides, and signs the file itself. */
@Injectable()
export class DocumentApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly signoff: SignoffService,
  ) {}

  private async access(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const client = !internal && Boolean(await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }));
    return { internal, client };
  }

  async list(projectId: string, userId: string, revisionId?: string) {
    const { internal, client } = await this.access(projectId, userId);
    if (!internal && !client) return [];
    return this.prisma.documentApprovalRequest.findMany({
      where: { projectId, ...(revisionId ? { revisionId } : {}), ...(client ? { status: { not: 'WITHDRAWN' }, revision: { document: { clientVisible: true } } } : {}) },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async request(projectId: string, userId: string, documentId: string, revisionId: string, dto: { message?: string; responseDueAt?: string }) {
    const { internal } = await this.access(projectId, userId);
    if (!internal) throw new ForbiddenException('Only Setjeka sends documents to the client for approval');
    const revision = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, document: { projectId, deletedAt: null } }, include: { document: true } });
    if (!revision) throw new NotFoundException('Revision not found');
    const pending = await this.prisma.documentApprovalRequest.findFirst({ where: { revisionId, status: 'PENDING' } });
    if (pending) throw new BadRequestException('This revision is already with the client');
    const clients = await this.prisma.projectMember.findMany({ where: { projectId, role: 'CLIENT', userId: { not: null }, user: { accountType: 'EXTERNAL' } }, select: { userId: true } });
    if (clients.length === 0) throw new BadRequestException('This project has no client login yet. Add the client to the team first');

    // Sending it for approval shares it: the client must be able to open it.
    const [request] = await this.prisma.$transaction([
      this.prisma.documentApprovalRequest.create({
        data: { projectId, revisionId, requestedById: userId, message: dto.message?.trim() || null, responseDueAt: responseDue(dto.responseDueAt) },
        include: INCLUDE,
      }),
      this.prisma.projectDocument.update({ where: { id: documentId }, data: { clientVisible: true } }),
    ]);
    const due = request.responseDueAt ? ` by ${request.responseDueAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}` : '';
    for (const c of clients) {
      await this.notifications.notify({
        userId: c.userId,
        projectId,
        type: 'DOCUMENT_APPROVAL_REQUESTED',
        entityType: 'DOCUMENT_REVISION',
        entityId: revisionId,
        message: `${revision.document.name} (Rev ${revision.revisionNumber}) is waiting for your approval${due}`,
        link: `/projects/${projectId}?tab=documents`,
      });
    }
    return request;
  }

  async withdraw(projectId: string, userId: string, id: string) {
    const { internal } = await this.access(projectId, userId);
    if (!internal) throw new ForbiddenException('Only Setjeka can withdraw a request');
    const r = await this.prisma.documentApprovalRequest.findFirst({ where: { id, projectId } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'PENDING') throw new BadRequestException('Only a request still waiting can be withdrawn');
    return this.prisma.documentApprovalRequest.update({ where: { id }, data: { status: 'WITHDRAWN' }, include: INCLUDE });
  }

  /** Meeting 3 hard rule: the client alone decides, checked here directly. */
  async decide(projectId: string, userId: string, id: string, dto: DecisionDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    const asClient = await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } });
    if (!asClient || user?.accountType !== 'EXTERNAL') throw new ForbiddenException('Only the client can approve or reject a document sent for approval');
    const r = await this.prisma.documentApprovalRequest.findFirst({ where: { id, projectId }, include: { revision: { include: { document: true } } } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'PENDING') throw new BadRequestException('This request has already been decided or withdrawn');
    const { outcome, comment } = resolveOutcome(dto);
    const doc = r.revision.document;

    const record = await this.signoff.sign({
      projectId,
      subject: 'DOCUMENT_REVISION',
      subjectId: r.revisionId,
      title: `${doc.name} (Rev ${r.revision.revisionNumber})`,
      kind: [doc.documentType ?? 'Document', doc.discipline].filter(Boolean).join(' · '),
      outcome,
      comment,
      signature: dto.signature,
      signerId: userId,
      meta,
      facts: [
        ['Document', doc.name],
        ['Revision', r.revision.revisionNumber],
        ['File', r.revision.originalFilename],
        ['Sent for approval', `${formatDay(r.createdAt)}${r.message ? ` - ${r.message}` : ''}`],
      ],
      source: { path: join(uploadRootDir(), r.revision.storedFilename), mimeType: r.revision.mimeType },
    });
    const updated = await this.prisma.documentApprovalRequest.update({
      where: { id },
      data: { status: 'DECIDED', outcome, comment, decidedById: userId, decidedAt: new Date() },
      include: INCLUDE,
    });
    await this.notifications.notify({
      userId: r.requestedById,
      projectId,
      type: 'DOCUMENT_APPROVAL_DECIDED',
      entityType: 'DOCUMENT_REVISION',
      entityId: r.revisionId,
      message: `${doc.name} (Rev ${r.revision.revisionNumber}): ${OUTCOME_LABEL[outcome].toLowerCase()} by the client${comment ? ` - ${comment}` : ''}`,
      link: `/projects/${projectId}?tab=documents`,
    });
    return { ...updated, record: { id: record.id, approved: isApproval(outcome) } };
  }
}
