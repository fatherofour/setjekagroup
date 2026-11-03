import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { InterfacesService } from './interfaces.service.js';
import { HiddenWorksService } from './hidden-works.service.js';
import { ApproveHiddenWorkDto, HiddenWorkDto, InterfaceDto, ProposeInterfaceDto, RerequestHiddenWorkDto, SiteCommentDto, SiteReasonDto } from './dto/site-records.dto.js';

// Site records sit with inspections in the permission matrix, as NCRs and
// tests do: contractors create (and answer), consultants and Setjeka edit,
// the client nothing. The services decide which side does what.
@Controller('projects/:projectId/interfaces')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class InterfacesController {
  constructor(private readonly interfaces: InterfacesService) {}

  @Get('options')
  @RequirePermission('INSPECTIONS', 'VIEW')
  options(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.interfaces.options(projectId, user.sub);
  }

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.interfaces.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.interfaces.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: InterfaceDto, @CurrentUser() user: JwtPayload) {
    return this.interfaces.create(projectId, user.sub, dto);
  }

  @Post(':id/propose')
  @RequirePermission('INSPECTIONS', 'CREATE')
  propose(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ProposeInterfaceDto, @CurrentUser() user: JwtPayload) {
    return this.interfaces.propose(projectId, user.sub, id, dto.agreedDetail);
  }

  @Post(':id/agree')
  @RequirePermission('INSPECTIONS', 'CREATE')
  agree(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteCommentDto, @CurrentUser() user: JwtPayload) {
    return this.interfaces.agree(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/reject')
  @RequirePermission('INSPECTIONS', 'CREATE')
  reject(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteReasonDto, @CurrentUser() user: JwtPayload) {
    return this.interfaces.reject(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/close')
  @RequirePermission('INSPECTIONS', 'CREATE')
  close(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteCommentDto, @CurrentUser() user: JwtPayload) {
    return this.interfaces.close(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/cancel')
  @RequirePermission('INSPECTIONS', 'CREATE')
  cancel(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteReasonDto, @CurrentUser() user: JwtPayload) {
    return this.interfaces.cancel(projectId, user.sub, id, dto.reason);
  }
}

@Controller('projects/:projectId/hidden-works')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class HiddenWorksController {
  constructor(private readonly hidden: HiddenWorksService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.hidden.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.hidden.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  request(@Param('projectId') projectId: string, @Body() dto: HiddenWorkDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.request(projectId, user.sub, dto);
  }

  @Post(':id/approve')
  @RequirePermission('INSPECTIONS', 'EDIT')
  approve(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ApproveHiddenWorkDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.approve(projectId, user.sub, id, dto);
  }

  @Post(':id/reject')
  @RequirePermission('INSPECTIONS', 'EDIT')
  reject(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteReasonDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.reject(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/rerequest')
  @RequirePermission('INSPECTIONS', 'CREATE')
  rerequest(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RerequestHiddenWorkDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.rerequest(projectId, user.sub, id, dto);
  }

  @Post(':id/cover')
  @RequirePermission('INSPECTIONS', 'CREATE')
  cover(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteCommentDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.cover(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/covered-unapproved')
  @RequirePermission('INSPECTIONS', 'EDIT')
  coveredUnapproved(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteReasonDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.coveredUnapproved(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermission('INSPECTIONS', 'CREATE')
  cancel(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SiteReasonDto, @CurrentUser() user: JwtPayload) {
    return this.hidden.cancel(projectId, user.sub, id, dto.reason);
  }
}
