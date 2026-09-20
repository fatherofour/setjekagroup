import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import type { PermissionModule, PermissionAction } from '../generated/prisma/enums.js';

@Controller('audit-log')
@UseGuards(JwtAccessGuard, AdminGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
    @Query('module') module?: PermissionModule,
    @Query('action') action?: PermissionAction,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ) {
    return this.auditLogService.findAll({
      userId,
      projectId,
      module,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number.parseInt(page, 10) : undefined,
    });
  }
}
