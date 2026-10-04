import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateClientDto } from './dto/create-client.dto.js';
import type { UpdateClientDto } from './dto/update-client.dto.js';

const PORTAL_USER_SELECT = { id: true, email: true, fullName: true, status: true, createdAt: true } as const;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({
      include: { _count: { select: { opportunities: true, portalUsers: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        opportunities: {
          select: { id: true, name: true, stage: true, estimatedValue: true, currency: true, convertedProjectId: true },
          orderBy: { createdAt: 'desc' },
        },
        portalUsers: { select: PORTAL_USER_SELECT, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(createdById: string, dto: CreateClientDto) {
    try {
      return await this.prisma.client.create({ data: { ...dto, name: dto.name.trim(), createdById } });
    } catch (err) {
      throw this.mapUniqueName(err);
    }
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    try {
      await this.prisma.client.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } });
    } catch (err) {
      throw this.mapUniqueName(err);
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const client = await this.findOne(id);
    if (client.opportunities.length > 0) {
      throw new BadRequestException(
        `This client has ${client.opportunities.length} ${client.opportunities.length === 1 ? 'opportunity' : 'opportunities'}. Remove or reassign those first.`,
      );
    }
    await this.prisma.client.delete({ where: { id } });
  }

  private mapUniqueName(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A client with that name already exists');
    }
    return err;
  }
}
