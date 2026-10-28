import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateSitePhotoDto, SitePhotoQuery, UpdateSitePhotoDto } from './dto/site-photo.dto.js';
import { photoRootDir } from './upload.util.js';

const PHOTO_INCLUDE = {
  uploadedBy: { select: { id: true, fullName: true } },
  projectNode: { select: { id: true, name: true } },
  scheduleActivity: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  issue: { select: { id: true, title: true } },
} as const;

type Links = Pick<UpdateSitePhotoDto, 'projectNodeId' | 'scheduleActivityId' | 'taskId' | 'issueId' | 'inspectionId' | 'punchItemId'>;

function cleanTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function coordinate(value: string | undefined, limit: number): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

@Injectable()
export class SitePhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Setjeka staff manage every photo and decide what the client sees; a
   * client login only ever sees the shared ones (Meeting 3). */
  private async viewer(projectId: string, userId: string) {
    await this.projectsService.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, role: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const client = !internal && Boolean(await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }));
    return { internal, client };
  }

  private async assertLinks(projectId: string, links: Links) {
    const checks: [string | null | undefined, () => Promise<unknown>, string][] = [
      [links.projectNodeId, () => this.prisma.projectNode.findFirst({ where: { id: links.projectNodeId!, projectId } }), 'Project area'],
      [links.scheduleActivityId, () => this.prisma.scheduleActivity.findFirst({ where: { id: links.scheduleActivityId!, projectId } }), 'Programme activity'],
      [links.taskId, () => this.prisma.projectTask.findFirst({ where: { id: links.taskId!, projectId } }), 'Task'],
      [links.issueId, () => this.prisma.projectIssue.findFirst({ where: { id: links.issueId!, projectId } }), 'Issue'],
      [links.inspectionId, () => this.prisma.siteInspection.findFirst({ where: { id: links.inspectionId!, projectId } }), 'Inspection'],
      [links.punchItemId, () => this.prisma.punchItem.findFirst({ where: { id: links.punchItemId!, projectId } }), 'Punch item'],
    ];
    for (const [id, find, label] of checks) {
      if (id && !(await find())) throw new BadRequestException(`${label} not found in this project`);
    }
  }

  /** Note counts per photo, so the gallery can show which ones have a
   * discussion going. */
  private async withNoteCounts<T extends { id: string }>(photos: T[]) {
    if (photos.length === 0) return [];
    const counts = await this.prisma.comment.groupBy({
      by: ['entityId'],
      where: { entityType: 'SITE_PHOTO', entityId: { in: photos.map((p) => p.id) } },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((c) => [c.entityId, c._count._all]));
    return photos.map((p) => ({ ...p, noteCount: byId.get(p.id) ?? 0 }));
  }

  async findAll(projectId: string, userId: string, query: SitePhotoQuery) {
    const { client } = await this.viewer(projectId, userId);
    const and: Prisma.SitePhotoWhereInput[] = [{ projectId }];
    if (client || query.shared === 'yes') and.push({ clientVisible: true });
    else if (query.shared === 'no') and.push({ clientVisible: false });
    if (query.from) and.push({ takenAt: { gte: new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.from) ? `${query.from}T00:00:00.000+02:00` : query.from) } });
    if (query.to) {
      // A bare date means "up to the end of that (South African) day".
      const to = new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to}T23:59:59.999+02:00` : query.to);
      and.push({ takenAt: { lte: to } });
    }
    for (const key of ['issueId', 'inspectionId', 'punchItemId', 'taskId', 'scheduleActivityId', 'projectNodeId', 'uploadedById'] as const) {
      if (query[key]) and.push({ [key]: query[key] });
    }
    const q = query.q?.trim();
    if (q) {
      const contains = { contains: q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { caption: contains },
          { locationNote: contains },
          { originalFilename: contains },
          { tags: { has: q.toLowerCase() } },
          { uploadedBy: { fullName: contains } },
          { issue: { title: contains } },
          { task: { title: contains } },
          { scheduleActivity: { name: contains } },
          { projectNode: { name: contains } },
        ],
      });
    }
    const photos = await this.prisma.sitePhoto.findMany({ where: { AND: and }, include: PHOTO_INCLUDE, orderBy: { takenAt: 'desc' }, take: 1000 });
    return this.withNoteCounts(photos);
  }

  async findOne(projectId: string, userId: string, id: string) {
    const { client } = await this.viewer(projectId, userId);
    const photo = await this.prisma.sitePhoto.findFirst({ where: { id, projectId, ...(client ? { clientVisible: true } : {}) }, include: PHOTO_INCLUDE });
    if (!photo) throw new NotFoundException('Photo not found');
    return (await this.withNoteCounts([photo]))[0];
  }

  async create(projectId: string, userId: string, dto: CreateSitePhotoDto, file: Express.Multer.File, thumb?: Express.Multer.File) {
    const { internal } = await this.viewer(projectId, userId);
    const links: Links = { projectNodeId: dto.projectNodeId, scheduleActivityId: dto.scheduleActivityId, taskId: dto.taskId, issueId: dto.issueId, inspectionId: dto.inspectionId, punchItemId: dto.punchItemId };
    try {
      await this.assertLinks(projectId, links);
    } catch (e) {
      this.removeFiles(file.filename, thumb?.filename);
      throw e;
    }
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : new Date();
    const photo = await this.prisma.sitePhoto.create({
      data: {
        projectId,
        storedFilename: file.filename,
        thumbFilename: thumb?.filename ?? null,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        caption: dto.caption?.trim() || null,
        // Never in the future - a phone with the wrong clock shouldn't
        // push a photo to the top of the gallery for ever.
        takenAt: takenAt > new Date() ? new Date() : takenAt,
        latitude: coordinate(dto.latitude, 90),
        longitude: coordinate(dto.longitude, 180),
        locationNote: dto.locationNote?.trim() || null,
        tags: cleanTags(dto.tags?.split(',')) ?? [],
        // Only Setjeka decides what the client sees.
        clientVisible: internal && dto.clientVisible === 'true',
        ...links,
        uploadedById: userId,
      },
      include: PHOTO_INCLUDE,
    });
    return { ...photo, noteCount: 0 };
  }

  /** Outside parties (consultants, contractors) may change or remove only
   * the photos they added themselves. */
  private async editable(projectId: string, userId: string, id: string) {
    const access = await this.viewer(projectId, userId);
    const photo = await this.prisma.sitePhoto.findFirst({ where: { id, projectId } });
    if (!photo || (access.client && !photo.clientVisible)) throw new NotFoundException('Photo not found');
    if (!access.internal && photo.uploadedById !== userId) throw new ForbiddenException('You can only change photos you added');
    return { photo, ...access };
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateSitePhotoDto) {
    const { internal } = await this.editable(projectId, userId, id);
    if (dto.clientVisible !== undefined && !internal) throw new ForbiddenException('Only Setjeka decides which photos the client sees');
    await this.assertLinks(projectId, dto);
    const updated = await this.prisma.sitePhoto.update({
      where: { id },
      data: {
        caption: dto.caption === undefined ? undefined : dto.caption?.trim() || null,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationNote: dto.locationNote === undefined ? undefined : dto.locationNote?.trim() || null,
        tags: cleanTags(dto.tags),
        clientVisible: dto.clientVisible,
        projectNodeId: dto.projectNodeId,
        scheduleActivityId: dto.scheduleActivityId,
        taskId: dto.taskId,
        issueId: dto.issueId,
        inspectionId: dto.inspectionId,
        punchItemId: dto.punchItemId,
      },
      include: PHOTO_INCLUDE,
    });
    return (await this.withNoteCounts([updated]))[0];
  }

  /** Share or withdraw a batch of photos in one go. */
  async setVisibility(projectId: string, userId: string, ids: string[], clientVisible: boolean) {
    const { internal } = await this.viewer(projectId, userId);
    if (!internal) throw new ForbiddenException('Only Setjeka decides which photos the client sees');
    const changed = await this.prisma.sitePhoto.updateMany({ where: { id: { in: ids }, projectId, clientVisible: !clientVisible }, data: { clientVisible } });
    return { updated: changed.count };
  }

  async remove(projectId: string, userId: string, id: string) {
    const { photo } = await this.editable(projectId, userId, id);
    await this.prisma.$transaction([
      this.prisma.comment.deleteMany({ where: { entityType: 'SITE_PHOTO', entityId: id } }),
      this.prisma.sitePhoto.delete({ where: { id } }),
    ]);
    this.removeFiles(photo.storedFilename, photo.thumbFilename);
  }

  /** The stored file for viewing or download - the preview if asked for and
   * one exists, otherwise the full image. */
  async fileFor(projectId: string, userId: string, id: string, variant: 'thumb' | 'full') {
    const photo = await this.findOne(projectId, userId, id);
    const name = variant === 'thumb' && photo.thumbFilename ? photo.thumbFilename : photo.storedFilename;
    const path = join(photoRootDir(), name);
    if (!existsSync(path)) throw new NotFoundException('Stored photo is missing');
    return { path, mimeType: name === photo.thumbFilename ? 'image/jpeg' : photo.mimeType, filename: photo.originalFilename };
  }

  private removeFiles(...names: (string | null | undefined)[]) {
    for (const name of names) {
      if (!name) continue;
      const path = join(photoRootDir(), name);
      try {
        if (existsSync(path)) unlinkSync(path);
      } catch {
        // A file left behind is harmless; the record is what matters.
      }
    }
  }
}
