import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PermissionModule, PermissionAction } from '../generated/prisma/enums.js';

export interface AuditLogFilter {
  userId?: string;
  projectId?: string;
  module?: PermissionModule;
  action?: PermissionAction;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: {
    userId: string;
    action: PermissionAction;
    module: PermissionModule;
    entityType?: string;
    entityId?: string | null;
    projectId?: string | null;
  }) {
    return this.prisma.auditLogEntry.create({ data: entry });
  }

  async findAll(filter: AuditLogFilter) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;
    const where = {
      userId: filter.userId,
      projectId: filter.projectId,
      module: filter.module,
      action: filter.action,
      createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    };
    const [total, entries] = await Promise.all([
      this.prisma.auditLogEntry.count({ where }),
      this.prisma.auditLogEntry.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, entries };
  }
}
