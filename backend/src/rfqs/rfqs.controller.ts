import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RfqsService } from './rfqs.service.js';
import { CreateRfqDto } from './dto/create-rfq.dto.js';
import { UpdateRfqDto } from './dto/update-rfq.dto.js';
import { InviteVendorDto } from './dto/invite-vendor.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/rfqs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Get()
  @RequirePermission('PROCUREMENT', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('PROCUREMENT', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateRfqDto, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROCUREMENT', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRfqDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rfqsService.update(projectId, user.sub, id, dto);
  }

  @Post(':id/invitations')
  @RequirePermission('PROCUREMENT', 'EDIT')
  invite(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: InviteVendorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rfqsService.invite(projectId, user.sub, id, dto);
  }

  @Patch(':id/issue')
  @RequirePermission('PROCUREMENT', 'APPROVE')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.issue(projectId, user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROCUREMENT', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.remove(projectId, user.sub, id);
  }
}
