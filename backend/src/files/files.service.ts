import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ArrayMaxSize, IsArray, IsHexColor, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { generateStoredName, uploadRootDir } from '../project-documents/upload.util.js';
import { drawingKey } from '../drawings/title-block.js';

export class TagDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @IsOptional() @IsHexColor() color?: string;
}

export class SetTagsDto {
  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) tagIds!: string[];
}

export class DistributionListDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) memberIds!: string[];
}

export class RestoreVersionDto {
  @IsString() @MinLength(1) @MaxLength(10) revisionNumber!: string;
}

const LIST_INCLUDE = {
  members: { include: { projectMember: { select: { id: true, role: true, externalName: true, externalCompany: true, user: { select: { fullName: true } }, contractor: { select: { name: true } } } } } },
} as const;

/** Tags, distribution lists, version restore and the recycle bin - the file
 * features the user chose from OpenConstructionERP (26 Oct 2026). */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  private async internalCheck(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    return { internal: u?.role === 'ADMIN' || u?.accountType === 'INTERNAL', admin: u?.role === 'ADMIN' };
  }

  // ---- Tags ------------------------------------------------------------------

  async tags(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const rows = await this.prisma.documentTag.findMany({ where: { projectId }, include: { _count: { select: { links: { where: { document: { deletedAt: null } } } } } }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.links }));
  }

  async createTag(projectId: string, userId: string, dto: TagDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const name = dto.name.trim();
    if (await this.prisma.documentTag.findUnique({ where: { projectId_name: { projectId, name } } })) throw new BadRequestException(`"${name}" is already a tag`);
    await this.prisma.documentTag.create({ data: { projectId, name, color: dto.color ?? '#64748b' } });
    return this.tags(projectId, userId);
  }

  async updateTag(projectId: string, userId: string, id: string, dto: TagDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const t = await this.prisma.documentTag.findFirst({ where: { id, projectId } });
    if (!t) throw new NotFoundException('Tag not found');
    const clash = await this.prisma.documentTag.findFirst({ where: { projectId, name: dto.name.trim(), id: { not: id } } });
    if (clash) throw new BadRequestException(`"${dto.name.trim()}" is already a tag`);
    await this.prisma.documentTag.update({ where: { id }, data: { name: dto.name.trim(), ...(dto.color ? { color: dto.color } : {}) } });
    return this.tags(projectId, userId);
  }

  async deleteTag(projectId: string, userId: string, id: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const t = await this.prisma.documentTag.findFirst({ where: { id, projectId } });
    if (!t) throw new NotFoundException('Tag not found');
    await this.prisma.documentTag.delete({ where: { id } });
    return this.tags(projectId, userId);
  }

  async setDocumentTags(projectId: string, userId: string, documentId: string, tagIds: string[]) {
    await this.projects.findOneForOwner(projectId, userId);
    const doc = await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: documentId, projectId } });
    if (!doc) throw new NotFoundException('Document not found');
    const ids = [...new Set(tagIds)];
    if ((await this.prisma.documentTag.count({ where: { projectId, id: { in: ids } } })) !== ids.length) throw new BadRequestException('Use tags from this project');
    await this.prisma.$transaction([
      this.prisma.documentTagLink.deleteMany({ where: { documentId } }),
      this.prisma.documentTagLink.createMany({ data: ids.map((tagId) => ({ documentId, tagId })) }),
    ]);
    return this.prisma.documentTagLink.findMany({ where: { documentId }, include: { tag: true } }).then((r) => r.map((x) => x.tag));
  }

  // ---- Distribution lists ----------------------------------------------------

  async lists(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    return this.prisma.distributionList.findMany({ where: { projectId }, include: LIST_INCLUDE, orderBy: { name: 'asc' } });
  }

  private async listData(projectId: string, dto: DistributionListDto) {
    const ids = [...new Set(dto.memberIds)];
    if ((await this.prisma.projectMember.count({ where: { projectId, id: { in: ids } } })) !== ids.length) throw new BadRequestException('Everyone on the list must be on the project');
    if (!ids.length) throw new BadRequestException('Add at least one person');
    return ids;
  }

  async saveList(projectId: string, userId: string, dto: DistributionListDto, id?: string) {
    const { internal } = await this.internalCheck(userId);
    await this.projects.findOneForOwner(projectId, userId);
    if (!internal) throw new ForbiddenException('Setjeka keeps the distribution lists');
    const ids = await this.listData(projectId, dto);
    const name = dto.name.trim();
    const clash = await this.prisma.distributionList.findFirst({ where: { projectId, name, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new BadRequestException(`There is already a list called "${name}"`);
    if (id) {
      const l = await this.prisma.distributionList.findFirst({ where: { id, projectId } });
      if (!l) throw new NotFoundException('List not found');
      await this.prisma.$transaction([
        this.prisma.distributionList.update({ where: { id }, data: { name, description: dto.description?.trim() || null } }),
        this.prisma.distributionListMember.deleteMany({ where: { listId: id } }),
        this.prisma.distributionListMember.createMany({ data: ids.map((projectMemberId) => ({ listId: id, projectMemberId })) }),
      ]);
    } else {
      await this.prisma.distributionList.create({ data: { projectId, name, description: dto.description?.trim() || null, createdById: userId, members: { create: ids.map((projectMemberId) => ({ projectMemberId })) } } });
    }
    return this.lists(projectId, userId);
  }

  async deleteList(projectId: string, userId: string, id: string) {
    const { internal } = await this.internalCheck(userId);
    await this.projects.findOneForOwner(projectId, userId);
    if (!internal) throw new ForbiddenException('Setjeka keeps the distribution lists');
    const l = await this.prisma.distributionList.findFirst({ where: { id, projectId } });
    if (!l) throw new NotFoundException('List not found');
    await this.prisma.distributionList.delete({ where: { id } });
    return this.lists(projectId, userId);
  }

  // ---- Versions ----------------------------------------------------------------

  /** Bring an earlier version back as the newest one (donor "file
   * versions"). The history is kept: it becomes a new revision with a copy of
   * the file, never an overwrite. */
  async restoreVersion(projectId: string, userId: string, documentId: string, revisionId: string, revisionNumber: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const r = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, document: { projectId, deletedAt: null } }, include: { document: { include: { revisions: { select: { revisionNumber: true } } } } } });
    if (!r) throw new NotFoundException('Version not found');
    const rev = revisionNumber.trim().toUpperCase();
    if (r.document.revisions.some((x) => x.revisionNumber.toUpperCase() === rev)) throw new BadRequestException(`Revision ${rev} is already used on this document`);
    const src = join(uploadRootDir(), r.storedFilename);
    if (!existsSync(src)) throw new NotFoundException('The file for that version is missing');
    const stored = generateStoredName(r.originalFilename);
    copyFileSync(src, join(uploadRootDir(), stored));
    await this.prisma.documentRevision.create({
      data: {
        documentId,
        revisionNumber: rev,
        storedFilename: stored,
        originalFilename: r.originalFilename,
        mimeType: r.mimeType,
        fileSize: r.fileSize,
        uploadedById: userId,
        purpose: r.purpose,
        revisionDate: r.revisionDate,
        titleBlock: r.titleBlock ?? undefined,
      },
    });
    return { restoredFrom: r.revisionNumber, revisionNumber: rev };
  }

  // ---- Recycle bin (admins only) --------------------------------------------

  private async assertAdmin(userId: string) {
    const { admin } = await this.internalCheck(userId);
    if (!admin) throw new ForbiddenException('Only an administrator opens the recycle bin');
  }

  async bin(userId: string) {
    await this.assertAdmin(userId);
    const docs = await this.prisma.projectDocument.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        drawingNumber: true,
        documentType: true,
        deletedAt: true,
        deletedBy: { select: { fullName: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        revisions: { select: { fileSize: true } },
      },
      orderBy: { deletedAt: 'desc' },
    });
    return docs.map((d) => ({ ...d, revisionCount: d.revisions.length, size: d.revisions.reduce((t, r) => t + r.fileSize, 0), revisions: undefined }));
  }

  async restore(userId: string, id: string) {
    await this.assertAdmin(userId);
    const d = await this.prisma.projectDocument.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!d) throw new NotFoundException('Not in the recycle bin');
    const key = drawingKey(d.drawingNumber);
    if (key && (await this.prisma.projectDocument.findFirst({ where: { projectId: d.projectId, drawingKey: key } }))) {
      throw new BadRequestException(`${d.drawingNumber} has since been issued again on this project - renumber that drawing first`);
    }
    await this.prisma.projectDocument.update({ where: { id }, data: { deletedAt: null, deletedById: null, drawingKey: key } });
    return this.bin(userId);
  }

  /** Gone for good: the record and its files. */
  async purge(userId: string, id: string) {
    await this.assertAdmin(userId);
    const d = await this.prisma.projectDocument.findFirst({ where: { id, deletedAt: { not: null } }, include: { revisions: { select: { storedFilename: true } } } });
    if (!d) throw new NotFoundException('Not in the recycle bin');
    try {
      await this.prisma.projectDocument.delete({ where: { id } });
    } catch {
      throw new BadRequestException('Another record still refers to this document, so it can only be restored');
    }
    for (const r of d.revisions) {
      try {
        const p = join(uploadRootDir(), r.storedFilename);
        if (existsSync(p)) unlinkSync(p);
      } catch {
        // a leftover file is harmless
      }
    }
    return this.bin(userId);
  }
}
