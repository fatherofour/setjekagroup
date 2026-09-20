import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateDocumentDto } from './dto/create-document.dto.js';
import type { UpdateDocumentDto } from './dto/update-document.dto.js';
import type { CreateRevisionDto } from './dto/create-revision.dto.js';
import type { ReviewRevisionDto } from './dto/review-revision.dto.js';
import type { DocumentAccessAction } from '../generated/prisma/enums.js';

const DOCUMENT_INCLUDE = {
  folder: { select: { id: true, name: true } },
  projectNode: { select: { id: true, name: true, type: true } },
  scheduleActivity: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  revisions: {
    orderBy: { uploadedAt: 'desc' as const },
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
      reviewedBy: { select: { id: true, fullName: true } },
    },
  },
} as const;

const DEFAULT_REVISION_NUMBER = 'A';

@Injectable()
export class ProjectDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.projectDocument.findMany({ where: { projectId }, include: DOCUMENT_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  private async assertFolderInProject(folderId: string, projectId: string) {
    const found = await this.prisma.documentFolder.findFirst({ where: { id: folderId, projectId } });
    if (!found) throw new BadRequestException('Folder not found in this project');
  }

  private async assertProjectNodeInProject(nodeId: string, projectId: string) {
    const found = await this.prisma.projectNode.findFirst({ where: { id: nodeId, projectId } });
    if (!found) throw new BadRequestException('Project node not found in this project');
  }

  private async assertScheduleActivityInProject(activityId: string, projectId: string) {
    const found = await this.prisma.scheduleActivity.findFirst({ where: { id: activityId, projectId } });
    if (!found) throw new BadRequestException('Schedule activity not found in this project');
  }

  async create(projectId: string, ownerId: string, userId: string, dto: CreateDocumentDto, file: Express.Multer.File) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.folderId) await this.assertFolderInProject(dto.folderId, projectId);
    if (dto.projectNodeId) await this.assertProjectNodeInProject(dto.projectNodeId, projectId);
    if (dto.scheduleActivityId) await this.assertScheduleActivityInProject(dto.scheduleActivityId, projectId);

    const document = await this.prisma.projectDocument.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        documentType: dto.documentType,
        discipline: dto.discipline,
        folderId: dto.folderId,
        projectNodeId: dto.projectNodeId,
        scheduleActivityId: dto.scheduleActivityId,
        createdById: userId,
        revisions: {
          create: {
            revisionNumber: dto.revisionNumber?.trim() || DEFAULT_REVISION_NUMBER,
            storedFilename: file.filename,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            uploadedById: userId,
          },
        },
      },
    });

    return this.getOne(projectId, document.id);
  }

  async getOne(projectId: string, id: string) {
    const document = await this.prisma.projectDocument.findFirst({ where: { id, projectId }, include: DOCUMENT_INCLUDE });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async update(projectId: string, ownerId: string, id: string, dto: UpdateDocumentDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    if (dto.folderId) await this.assertFolderInProject(dto.folderId, projectId);
    if (dto.projectNodeId) await this.assertProjectNodeInProject(dto.projectNodeId, projectId);
    if (dto.scheduleActivityId) await this.assertScheduleActivityInProject(dto.scheduleActivityId, projectId);

    await this.prisma.projectDocument.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        documentType: dto.documentType,
        discipline: dto.discipline,
        folderId: dto.folderId === undefined ? undefined : dto.folderId,
        projectNodeId: dto.projectNodeId === undefined ? undefined : dto.projectNodeId,
        scheduleActivityId: dto.scheduleActivityId === undefined ? undefined : dto.scheduleActivityId,
      },
    });
    return this.getOne(projectId, id);
  }

  async remove(projectId: string, ownerId: string, id: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, id);
    await this.prisma.projectDocument.delete({ where: { id } });
  }

  // Revisions are immutable — a new upload always adds a row, never
  // overwrites or deletes a prior one. "Current" is never stored; callers
  // treat revisions[0] (most-recently-uploaded, per DOCUMENT_INCLUDE's
  // ordering) as current, so it can never drift from what's actually on disk.
  async addRevision(projectId: string, ownerId: string, documentId: string, userId: string, dto: CreateRevisionDto, file: Express.Multer.File) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.getOne(projectId, documentId);

    await this.prisma.documentRevision.create({
      data: {
        documentId,
        revisionNumber: dto.revisionNumber?.trim() || DEFAULT_REVISION_NUMBER,
        storedFilename: file.filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById: userId,
      },
    });
    return this.getOne(projectId, documentId);
  }

  private async findOwnedRevision(projectId: string, ownerId: string, documentId: string, revisionId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const revision = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, document: { projectId } } });
    if (!revision) throw new NotFoundException('Revision not found');
    return revision;
  }

  async reviewRevision(projectId: string, ownerId: string, documentId: string, revisionId: string, reviewerId: string, dto: ReviewRevisionDto) {
    await this.findOwnedRevision(projectId, ownerId, documentId, revisionId);
    await this.prisma.documentRevision.update({
      where: { id: revisionId },
      data: { reviewStatus: dto.reviewStatus, reviewedById: reviewerId, reviewedAt: new Date() },
    });
    return this.getOne(projectId, documentId);
  }

  async getRevisionForDownload(projectId: string, ownerId: string, documentId: string, revisionId: string, userId: string, action: DocumentAccessAction) {
    const revision = await this.findOwnedRevision(projectId, ownerId, documentId, revisionId);
    await this.prisma.documentAccessLog.create({ data: { documentRevisionId: revision.id, userId, action } });
    return revision;
  }
}
