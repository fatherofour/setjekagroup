import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Patch, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CalibrationDto, CreateMarkupDto, MarkupIssueDto, MarkupsService, STAMPS, UpdateMarkupDto } from './markups.service.js';

@Controller('projects/:projectId')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class MarkupsController {
  constructor(private readonly markups: MarkupsService) {}

  @Get('documents/:documentId/revisions/:revisionId/markups')
  @RequirePermission('DOCUMENTS', 'VIEW')
  list(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @CurrentUser() user: JwtPayload) {
    return this.markups.list(projectId, user.sub, documentId, revisionId);
  }

  @Post('documents/:documentId/revisions/:revisionId/markups')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  create(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @Body() dto: CreateMarkupDto, @CurrentUser() user: JwtPayload) {
    return this.markups.create(projectId, user.sub, documentId, revisionId, dto);
  }

  @Get('documents/:documentId/revisions/:revisionId/marked-up')
  @RequirePermission('DOCUMENTS', 'VIEW')
  async markedUp(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { bytes, filename } = await this.markups.markedUp(projectId, user.sub, documentId, revisionId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(bytes);
  }

  @Get('markup-stamps')
  @RequirePermission('DOCUMENTS', 'VIEW')
  stamps() {
    return STAMPS;
  }

  @Get('documents/:documentId/revisions/:revisionId/calibrations')
  @RequirePermission('DOCUMENTS', 'VIEW')
  calibrations(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @CurrentUser() user: JwtPayload) {
    return this.markups.calibrations(projectId, user.sub, documentId, revisionId);
  }

  @Put('documents/:documentId/revisions/:revisionId/calibrations')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  calibrate(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @Body() dto: CalibrationDto, @CurrentUser() user: JwtPayload) {
    return this.markups.calibrate(projectId, user.sub, documentId, revisionId, dto);
  }

  @Patch('markups/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateMarkupDto, @CurrentUser() user: JwtPayload) {
    return this.markups.update(projectId, user.sub, id, dto);
  }

  @Delete('markups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('DOCUMENTS', 'COMMENT')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.markups.remove(projectId, user.sub, id);
  }

  @Post('markups/:id/issue')
  @RequirePermission('ISSUES', 'CREATE')
  raiseIssue(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: MarkupIssueDto, @CurrentUser() user: JwtPayload) {
    return this.markups.raiseIssue(projectId, user.sub, id, dto);
  }
}

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [MarkupsController],
  providers: [MarkupsService],
})
export class MarkupsModule {}
