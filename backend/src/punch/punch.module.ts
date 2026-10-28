import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PunchItemDto, PunchNoteDto, PunchQuery, PunchService } from './punch.service.js';

@Controller('projects/:projectId/punch-items')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class PunchController {
  constructor(private readonly punch: PunchService) {}

  @Get()
  @RequirePermission('ISSUES', 'VIEW')
  list(@Param('projectId') projectId: string, @Query() q: PunchQuery, @CurrentUser() user: JwtPayload) {
    return this.punch.list(projectId, user.sub, q);
  }

  @Get('pdf')
  @RequirePermission('ISSUES', 'VIEW')
  async pdf(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { bytes, filename } = await this.punch.pdf(projectId, user.sub);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(bytes);
  }

  @Post()
  @RequirePermission('ISSUES', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: PunchItemDto, @CurrentUser() user: JwtPayload) {
    return this.punch.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('ISSUES', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PunchItemDto, @CurrentUser() user: JwtPayload) {
    return this.punch.update(projectId, user.sub, id, dto);
  }

  @Post(':id/ready')
  @RequirePermission('ISSUES', 'VIEW')
  ready(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PunchNoteDto, @CurrentUser() user: JwtPayload) {
    return this.punch.markReady(projectId, user.sub, id, dto.note);
  }

  @Post(':id/close')
  @RequirePermission('ISSUES', 'VIEW')
  close(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.punch.decide(projectId, user.sub, id, true);
  }

  @Post(':id/send-back')
  @RequirePermission('ISSUES', 'VIEW')
  sendBack(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PunchNoteDto, @CurrentUser() user: JwtPayload) {
    return this.punch.decide(projectId, user.sub, id, false, dto.note);
  }

  @Post(':id/reopen')
  @RequirePermission('ISSUES', 'VIEW')
  reopen(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PunchNoteDto, @CurrentUser() user: JwtPayload) {
    return this.punch.reopen(projectId, user.sub, id, dto.note ?? '');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('ISSUES', 'CREATE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.punch.remove(projectId, user.sub, id);
  }
}

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [PunchController],
  providers: [PunchService],
})
export class PunchModule {}
