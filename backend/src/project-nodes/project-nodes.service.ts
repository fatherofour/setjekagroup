import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateNodeDto } from './dto/create-node.dto.js';
import type { UpdateNodeDto } from './dto/update-node.dto.js';

@Injectable()
export class ProjectNodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.projectNode.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async assertParentInProject(parentId: string, projectId: string) {
    const parent = await this.prisma.projectNode.findFirst({ where: { id: parentId, projectId } });
    if (!parent) throw new BadRequestException('Parent node not found in this project');
  }

  async create(projectId: string, ownerId: string, dto: CreateNodeDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.parentId) await this.assertParentInProject(dto.parentId, projectId);

    return this.prisma.projectNode.create({
      data: {
        projectId,
        type: dto.type,
        name: dto.name,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  private async findOwnedNode(projectId: string, ownerId: string, nodeId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const node = await this.prisma.projectNode.findFirst({ where: { id: nodeId, projectId } });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async update(projectId: string, ownerId: string, nodeId: string, dto: UpdateNodeDto) {
    await this.findOwnedNode(projectId, ownerId, nodeId);
    if (dto.parentId) {
      if (dto.parentId === nodeId) throw new BadRequestException('A node cannot be its own parent');
      await this.assertParentInProject(dto.parentId, projectId);
    }

    return this.prisma.projectNode.update({
      where: { id: nodeId },
      data: {
        type: dto.type,
        name: dto.name,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async remove(projectId: string, ownerId: string, nodeId: string) {
    await this.findOwnedNode(projectId, ownerId, nodeId);
    await this.prisma.projectNode.delete({ where: { id: nodeId } });
  }
}
