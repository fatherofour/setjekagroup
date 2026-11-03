import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermitsService } from './permits.service.js';
import { IssuePermitDto, PermitNoteDto, PermitReasonDto, RequestPermitDto } from './dto/permits.dto.js';

// Permits sit with inspections in the permission matrix, as incidents do:
// anyone on site asks, the client sees none. The service decides who
// issues, suspends and closes.
@Controller('projects/:projectId/hse/permits')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class PermitsController {
  constructor(private readonly permits: PermitsService) {}

  @Get('checks')
  @RequirePermission('INSPECTIONS', 'VIEW')
  checks() {
    return this.permits.checks();
  }

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.permits.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.permits.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  request(@Param('projectId') projectId: string, @Body() dto: RequestPermitDto, @CurrentUser() user: JwtPayload) {
    return this.permits.request(projectId, user.sub, dto);
  }

  @Post(':id/issue')
  @RequirePermission('INSPECTIONS', 'CREATE')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: IssuePermitDto, @CurrentUser() user: JwtPayload) {
    return this.permits.issue(projectId, user.sub, id, dto.conditions);
  }

  @Post(':id/reject')
  @RequirePermission('INSPECTIONS', 'CREATE')
  reject(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PermitReasonDto, @CurrentUser() user: JwtPayload) {
    return this.permits.reject(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/suspend')
  @RequirePermission('INSPECTIONS', 'CREATE')
  suspend(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PermitReasonDto, @CurrentUser() user: JwtPayload) {
    return this.permits.suspend(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/reinstate')
  @RequirePermission('INSPECTIONS', 'CREATE')
  reinstate(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PermitNoteDto, @CurrentUser() user: JwtPayload) {
    return this.permits.reinstate(projectId, user.sub, id, dto.note);
  }

  @Post(':id/hand-back')
  @RequirePermission('INSPECTIONS', 'CREATE')
  handBack(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PermitNoteDto, @CurrentUser() user: JwtPayload) {
    return this.permits.handBack(projectId, user.sub, id, dto.note);
  }

  @Post(':id/close')
  @RequirePermission('INSPECTIONS', 'CREATE')
  close(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PermitNoteDto, @CurrentUser() user: JwtPayload) {
    return this.permits.close(projectId, user.sub, id, dto.note);
  }

  @Post(':id/cancel')
  @RequirePermission('INSPECTIONS', 'CREATE')
  cancel(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PermitReasonDto, @CurrentUser() user: JwtPayload) {
    return this.permits.cancel(projectId, user.sub, id, dto.reason);
  }
}
