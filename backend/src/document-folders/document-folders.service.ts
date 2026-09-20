import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateFolderDto } from './dto/create-folder.dto.js';
import type { UpdateFolderDto } from './dto/update-folder.dto.js';

@Injectable()
export class DocumentFoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.documentFolder.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  private async assertParentInProject(parentId: string, projectId: string) {
    const parent = await this.prisma.documentFolder.findFirst({ where: { id: parentId, projectId } });
    if (!parent) throw new BadRequestException('Parent folder not found in this project');
  }

  async create(projectId: string, ownerId: string, dto: CreateFolderDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.parentId) await this.assertParentInProject(dto.parentId, projectId);
    return this.prisma.documentFolder.create({
      data: { projectId, name: dto.name, parentId: dto.parentId, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  private async findOwnedFolder(projectId: string, ownerId: string, folderId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const folder = await this.prisma.documentFolder.findFirst({ where: { id: folderId, projectId } });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async update(projectId: string, ownerId: string, folderId: string, dto: UpdateFolderDto) {
    await this.findOwnedFolder(projectId, ownerId, folderId);
    if (dto.parentId) {
      if (dto.parentId === folderId) throw new BadRequestException('A folder cannot be its own parent');
      await this.assertParentInProject(dto.parentId, projectId);
    }
    return this.prisma.documentFolder.update({
      where: { id: folderId },
      data: { name: dto.name, parentId: dto.parentId === undefined ? undefined : dto.parentId, sortOrder: dto.sortOrder },
    });
  }

  async remove(projectId: string, ownerId: string, folderId: string) {
    await this.findOwnedFolder(projectId, ownerId, folderId);
    await this.prisma.documentFolder.delete({ where: { id: folderId } });
  }
}
