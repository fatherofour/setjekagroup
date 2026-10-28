import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { CommunicationsService } from './communications.service.js';
import { CommunicationQuery, CommunicationVariationDto, CreateCommunicationDto, RespondCommunicationDto, UpdateCommunicationDto } from './dto/communication.dto.js';

@Controller('projects/:projectId')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('communications-address-book')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  addressBook(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.communications.addressBook(projectId, user.sub);
  }

  @Get('communications')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @Query() query: CommunicationQuery, @CurrentUser() user: JwtPayload) {
    return this.communications.list(projectId, user.sub, query);
  }

  @Get('communications/:id')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.communications.findOne(projectId, user.sub, id);
  }

  @Post('communications')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateCommunicationDto, @CurrentUser() user: JwtPayload) {
    return this.communications.create(projectId, user.sub, dto);
  }

  @Patch('communications/:id')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateCommunicationDto, @CurrentUser() user: JwtPayload) {
    return this.communications.update(projectId, user.sub, id, dto);
  }

  @Post('communications/:id/send')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  send(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.communications.send(projectId, user.sub, id);
  }

  @Post('communications/:id/issue')
  @RequirePermission('COMMUNICATIONS', 'APPROVE')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.communications.issue(projectId, user.sub, id);
  }

  @Post('communications/:id/acknowledge')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  acknowledge(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.communications.acknowledge(projectId, user.sub, id);
  }

  @Post('communications/:id/respond')
  @RequirePermission('COMMUNICATIONS', 'COMMENT')
  respond(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RespondCommunicationDto, @CurrentUser() user: JwtPayload) {
    return this.communications.respond(projectId, user.sub, id, dto.response);
  }

  @Post('communications/:id/close')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  close(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.communications.setStatus(projectId, user.sub, id, 'CLOSED');
  }

  @Post('communications/:id/cancel')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  cancel(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.communications.setStatus(projectId, user.sub, id, 'CANCELLED');
  }

  @Post('communications/:id/variation')
  @RequirePermission('COMMUNICATIONS', 'APPROVE')
  raiseVariation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CommunicationVariationDto, @CurrentUser() user: JwtPayload) {
    return this.communications.raiseVariation(projectId, user.sub, id, dto);
  }
}
