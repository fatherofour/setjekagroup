import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProjectDashboardService } from './project-dashboard.service.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/dashboard')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectDashboardController {
  constructor(private readonly dashboardService: ProjectDashboardService) {}

  @Get()
  @RequirePermission('PROJECT_STRUCTURE', 'VIEW')
  getDashboard(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboard(projectId, user.sub);
  }
}
