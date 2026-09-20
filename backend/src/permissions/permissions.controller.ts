import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { UpdateRoleMatrixDto } from './dto/update-role-matrix.dto.js';
import { CreateOverrideDto } from './dto/create-override.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';

/** The admin-editable default matrix (ProjectMemberRole x module x
 * action) - see PermissionsService.can() for how it's applied. */
@Controller('permissions/role-matrix')
@UseGuards(JwtAccessGuard, AdminGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  getMatrix() {
    return this.permissionsService.getRoleMatrix();
  }

  @Patch()
  updateMatrix(@Body() dto: UpdateRoleMatrixDto) {
    return this.permissionsService.updateRoleMatrix(dto.rows);
  }
}

/** Per-project-member exceptions to the default matrix - the "record" and
 * time-boxed external-sharing case (e.g. granting one CLIENT access to
 * one specific document for two weeks). Gated the same way managing the
 * team itself is: EDIT on TEAM for this project, not admin-only, so a
 * project manager can grant these without needing platform-admin rights. */
@Controller('projects/:projectId/members/:memberId/permission-overrides')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class MemberPermissionOverridesController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('TEAM', 'VIEW')
  findAll(@Param('memberId') memberId: string) {
    return this.permissionsService.listOverrides(memberId);
  }

  @Post()
  @RequirePermission('TEAM', 'EDIT')
  create(@Param('memberId') memberId: string, @Body() dto: CreateOverrideDto) {
    return this.permissionsService.createOverride({
      projectMemberId: memberId,
      module: dto.module,
      action: dto.action,
      recordId: dto.recordId,
      allowed: dto.allowed,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  @Delete(':overrideId')
  @RequirePermission('TEAM', 'EDIT')
  async remove(@Param('overrideId') overrideId: string) {
    await this.permissionsService.deleteOverride(overrideId);
  }
}
