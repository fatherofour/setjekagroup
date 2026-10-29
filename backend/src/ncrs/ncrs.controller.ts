import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { NcrsService } from './ncrs.service.js';
import { CreateNcrDto, NcrCommentDto, NcrReasonDto, RespondNcrDto, UpdateNcrDto } from './dto/ncr.dto.js';

// Quality work sits with inspections in the permission matrix: consultants
// and Setjeka edit, contractors create (their answers), the client nothing.
// The service decides who raises, answers and closes each NCR.
@Controller('projects/:projectId/ncrs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class NcrsController {
  constructor(private readonly ncrs: NcrsService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.ncrs.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ncrs.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateNcrDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('INSPECTIONS', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateNcrDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.update(projectId, user.sub, id, dto);
  }

  @Post(':id/respond')
  @RequirePermission('INSPECTIONS', 'CREATE')
  respond(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RespondNcrDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.respond(projectId, user.sub, id, dto);
  }

  @Post(':id/agree')
  @RequirePermission('INSPECTIONS', 'EDIT')
  agree(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NcrCommentDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.agree(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/reject')
  @RequirePermission('INSPECTIONS', 'EDIT')
  reject(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NcrReasonDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.reject(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/ready')
  @RequirePermission('INSPECTIONS', 'CREATE')
  ready(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NcrCommentDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.ready(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/close')
  @RequirePermission('INSPECTIONS', 'EDIT')
  close(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NcrCommentDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.close(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/reopen')
  @RequirePermission('INSPECTIONS', 'EDIT')
  reopen(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NcrReasonDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.reopen(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/void')
  @RequirePermission('INSPECTIONS', 'EDIT')
  void(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NcrReasonDto, @CurrentUser() user: JwtPayload) {
    return this.ncrs.void(projectId, user.sub, id, dto.reason);
  }
}
