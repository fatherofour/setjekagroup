import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { uploadRootDir } from '../project-documents/upload.util.js';

/** The model object a link or issue is about. */
class ObjectRef {
  @IsString() @MinLength(1) @MaxLength(64) globalId!: string;
  @IsOptional() @IsInt() expressId?: number;
  @IsOptional() @IsString() @MaxLength(80) ifcType?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsObject() viewpoint?: Record<string, unknown>;
}

export class ModelIssueDto extends ObjectRef {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const LINKABLE = ['ISSUE', 'RFI', 'SUBMITTAL', 'DOCUMENT', 'SITE_PHOTO', 'INSPECTION'] as const;
type Linkable = (typeof LINKABLE)[number];

export class ModelLinkDto extends ObjectRef {
  @IsIn(LINKABLE as unknown as string[]) entityType!: Linkable;
  @IsUUID() entityId!: string;
}

export class UploadModelDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) discipline?: string;
  /** Add as a new revision of this model. */
  @IsOptional() @IsUUID() documentId?: string;
  @IsOptional() @IsString() @MaxLength(10) revision?: string;
}

const isIfc = (name: string) => /\.ifc$/i.test(name);

/** The model viewer's records (register BIM rows 55-61): IFC models kept as
 * project documents, and model objects linked to issues - with the camera
 * view they were raised from - and to RFIs, submittals, documents, photos
 * and inspections. The models are drawn in the browser (web-ifc). */
@Injectable()
export class ModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const client = !internal && Boolean(await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }));
    return { internal, client };
  }

  /** IFC models on the project. The client sees those Setjeka has shared
   * (register CLI row 85: "BIM where permitted"). */
  async list(projectId: string, userId: string) {
    const { client } = await this.who(projectId, userId);
    const docs = await this.prisma.projectDocument.findMany({
      where: { deletedAt: null, projectId, ...(client ? { clientVisible: true } : {}), revisions: { some: { originalFilename: { endsWith: '.ifc', mode: 'insensitive' } } } },
      select: {
        id: true,
        name: true,
        discipline: true,
        clientVisible: true,
        revisions: { orderBy: { uploadedAt: 'desc' }, select: { id: true, revisionNumber: true, originalFilename: true, fileSize: true, uploadedAt: true, uploadedBy: { select: { fullName: true } } } },
        _count: { select: { modelLinks: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return docs.map((d) => ({ ...d, revisions: d.revisions.filter((r) => isIfc(r.originalFilename)), linkCount: client ? 0 : d._count.modelLinks, _count: undefined }));
  }

  async upload(projectId: string, userId: string, dto: UploadModelDto, file: Express.Multer.File) {
    const drop = () => {
      try {
        unlinkSync(join(uploadRootDir(), file.filename));
      } catch {
        // already gone
      }
    };
    try {
      const { client } = await this.who(projectId, userId);
      if (client) throw new ForbiddenException('The project team uploads models');
      if (!isIfc(file.originalname)) throw new BadRequestException('Upload the model as IFC - export it from Revit, ArchiCAD or similar');
      const rev = {
        revisionNumber: dto.revision?.trim().toUpperCase() || 'A',
        storedFilename: file.filename,
        originalFilename: file.originalname,
        mimeType: 'application/x-step',
        fileSize: file.size,
        uploadedById: userId,
      };
      if (dto.documentId) {
        const doc = await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: dto.documentId, projectId }, include: { revisions: { select: { revisionNumber: true } } } });
        if (!doc) throw new NotFoundException('Model not found');
        if (doc.revisions.some((r) => r.revisionNumber.toUpperCase() === rev.revisionNumber)) throw new BadRequestException(`Revision ${rev.revisionNumber} is already uploaded`);
        await this.prisma.documentRevision.create({ data: { documentId: doc.id, ...rev } });
        return { id: doc.id };
      }
      const doc = await this.prisma.projectDocument.create({
        data: {
          projectId,
          name: dto.name?.trim() || file.originalname.replace(/\.ifc$/i, ''),
          documentType: 'Model',
          discipline: dto.discipline?.trim() || null,
          createdById: userId,
          revisions: { create: rev },
        },
      });
      return { id: doc.id };
    } catch (e) {
      drop();
      throw e;
    }
  }

  private async model(projectId: string, documentId: string) {
    const d = await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: documentId, projectId }, select: { id: true, name: true } });
    if (!d) throw new NotFoundException('Model not found');
    return d;
  }

  /** Every link on a model, with what it points at. */
  async links(projectId: string, userId: string, documentId: string) {
    const { client } = await this.who(projectId, userId);
    await this.model(projectId, documentId);
    if (client) return [];
    const rows = await this.prisma.modelObjectLink.findMany({ where: { documentId }, include: { createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } });
    const ids = (t: string) => rows.filter((r) => r.entityType === t).map((r) => r.entityId);
    const [issues, rfis, submittals, docs, photos, inspections] = await Promise.all([
      this.prisma.projectIssue.findMany({ where: { id: { in: ids('ISSUE') } }, select: { id: true, title: true, status: true, priority: true, owner: { select: { externalName: true, user: { select: { fullName: true } } } } } }),
      this.prisma.rfi.findMany({ where: { id: { in: ids('RFI') } }, select: { id: true, rfiNumber: true, title: true, status: true } }),
      this.prisma.submittal.findMany({ where: { id: { in: ids('SUBMITTAL') } }, select: { id: true, title: true, status: true } }),
      this.prisma.projectDocument.findMany({ where: { deletedAt: null, id: { in: ids('DOCUMENT') } }, select: { id: true, name: true, drawingNumber: true } }),
      this.prisma.sitePhoto.findMany({ where: { id: { in: ids('SITE_PHOTO') } }, select: { id: true, caption: true, originalFilename: true } }),
      this.prisma.siteInspection.findMany({ where: { id: { in: ids('INSPECTION') } }, select: { id: true, number: true, title: true, status: true } }),
    ]);
    const describe = (t: string, id: string): { label: string; status: string | null; owner?: string | null } | null => {
      switch (t) {
        case 'ISSUE': {
          const x = issues.find((i) => i.id === id);
          return x ? { label: x.title, status: x.status, owner: x.owner?.user?.fullName ?? x.owner?.externalName ?? null } : null;
        }
        case 'RFI': {
          const x = rfis.find((i) => i.id === id);
          return x ? { label: `${x.rfiNumber} ${x.title}`, status: x.status } : null;
        }
        case 'SUBMITTAL': {
          const x = submittals.find((i) => i.id === id);
          return x ? { label: x.title, status: x.status } : null;
        }
        case 'DOCUMENT': {
          const x = docs.find((i) => i.id === id);
          return x ? { label: `${x.drawingNumber ? `${x.drawingNumber} ` : ''}${x.name}`, status: null } : null;
        }
        case 'SITE_PHOTO': {
          const x = photos.find((i) => i.id === id);
          return x ? { label: x.caption ?? x.originalFilename, status: null } : null;
        }
        case 'INSPECTION': {
          const x = inspections.find((i) => i.id === id);
          return x ? { label: `${x.number} ${x.title}`, status: x.status } : null;
        }
      }
      return null;
    };
    // A link whose record has since been deleted is dropped from the list.
    return rows.flatMap((r) => {
      const d = describe(r.entityType, r.entityId);
      return d ? [{ ...r, record: d }] : [];
    });
  }

  private async assertEntity(projectId: string, t: Linkable, id: string) {
    const where = { id, projectId };
    const found =
      t === 'ISSUE'
        ? await this.prisma.projectIssue.findFirst({ where })
        : t === 'RFI'
          ? await this.prisma.rfi.findFirst({ where })
          : t === 'SUBMITTAL'
            ? await this.prisma.submittal.findFirst({ where })
            : t === 'DOCUMENT'
              ? await this.prisma.projectDocument.findFirst({ where: { ...where, deletedAt: null } })
              : t === 'SITE_PHOTO'
                ? await this.prisma.sitePhoto.findFirst({ where })
                : await this.prisma.siteInspection.findFirst({ where });
    if (!found) throw new BadRequestException('That record is not on this project');
  }

  async link(projectId: string, userId: string, documentId: string, dto: ModelLinkDto) {
    const { client } = await this.who(projectId, userId);
    if (client) throw new ForbiddenException('The project team links model objects');
    await this.model(projectId, documentId);
    await this.assertEntity(projectId, dto.entityType, dto.entityId);
    const data = { projectId, documentId, globalId: dto.globalId, expressId: dto.expressId ?? null, ifcType: dto.ifcType ?? null, name: dto.name ?? null, entityType: dto.entityType, entityId: dto.entityId, viewpoint: (dto.viewpoint ?? undefined) as object | undefined, createdById: userId };
    await this.prisma.modelObjectLink.upsert({
      where: { documentId_globalId_entityType_entityId: { documentId, globalId: dto.globalId, entityType: dto.entityType, entityId: dto.entityId } },
      update: {},
      create: data,
    });
    return this.links(projectId, userId, documentId);
  }

  async unlink(projectId: string, userId: string, documentId: string, linkId: string) {
    const { internal, client } = await this.who(projectId, userId);
    if (client) throw new ForbiddenException('Not allowed');
    const l = await this.prisma.modelObjectLink.findFirst({ where: { id: linkId, documentId, projectId } });
    if (!l) throw new NotFoundException('Link not found');
    if (!internal && l.createdById !== userId) throw new ForbiddenException('Only whoever made the link (or Setjeka) removes it');
    await this.prisma.modelObjectLink.delete({ where: { id: linkId } });
    return this.links(projectId, userId, documentId);
  }

  /** An issue raised against a model object (BIM row 59), keeping the
   * object and the view it was seen from. */
  async raiseIssue(projectId: string, userId: string, documentId: string, dto: ModelIssueDto) {
    const { client } = await this.who(projectId, userId);
    if (client) throw new ForbiddenException('The project team raises model issues');
    const model = await this.model(projectId, documentId);
    if (dto.ownerId && !(await this.prisma.projectMember.findFirst({ where: { id: dto.ownerId, projectId } }))) throw new BadRequestException('The owner must be on the project');
    const what = [dto.ifcType?.replace(/^IFC/i, ''), dto.name].filter(Boolean).join(' ') || 'an object';
    const issue = await this.prisma.projectIssue.create({
      data: {
        projectId,
        title: dto.title.trim(),
        description: [dto.description?.trim(), `Raised in the model ${model.name} on ${what} (GlobalId ${dto.globalId}).`].filter(Boolean).join('\n\n'),
        ownerId: dto.ownerId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: dto.priority ?? 'MEDIUM',
      },
      include: { owner: { select: { userId: true } } },
    });
    await this.prisma.modelObjectLink.create({
      data: { projectId, documentId, globalId: dto.globalId, expressId: dto.expressId ?? null, ifcType: dto.ifcType ?? null, name: dto.name ?? null, entityType: 'ISSUE', entityId: issue.id, viewpoint: (dto.viewpoint ?? undefined) as object | undefined, createdById: userId },
    });
    if (issue.owner?.userId && issue.owner.userId !== userId) {
      await this.notifications.notify({ userId: issue.owner.userId, projectId, type: 'ISSUE_ASSIGNED', entityType: 'ISSUE', entityId: issue.id, message: `Model issue in ${model.name}: ${issue.title}` });
    }
    return this.links(projectId, userId, documentId);
  }
}
