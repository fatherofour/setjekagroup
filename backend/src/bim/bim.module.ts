import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BimService, FederationDto, type ElementQuery } from './bim.service.js';
import { ClashIssueDto, ClashService, ClashStatusDto, ClashTestDto } from './clash.service.js';
import { SmartViewDto, SmartViewsService } from './smart-views.service.js';
import { RequirementSetDto, RequirementsService, RunCheckDto } from './requirements.service.js';
import { BcfService } from './bcf.service.js';
import { SelectionDto } from './rules.js';

const smallUpload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function send(res: Response, buffer: Buffer, filename: string, type: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
}

/** The BIM hub, coordination hub, clash detection, smart views, BIM
 * requirements and BCF exchange. Reading the models is the documents
 * permission; turning findings into issues is the issues permission. */
@Controller('projects/:projectId/bim')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class BimController {
  constructor(
    private readonly bim: BimService,
    private readonly clash: ClashService,
    private readonly views: SmartViewsService,
    private readonly reqs: RequirementsService,
    private readonly bcf: BcfService,
  ) {}

  @Get('hub')
  @RequirePermission('DOCUMENTS', 'VIEW')
  hub(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.bim.hub(projectId, user.sub);
  }

  @Get('elements')
  @RequirePermission('DOCUMENTS', 'VIEW')
  elements(@Param('projectId') projectId: string, @Query() q: ElementQuery, @CurrentUser() user: JwtPayload) {
    return this.bim.elements(projectId, user.sub, q);
  }

  @Get('elements.xlsx')
  @RequirePermission('DOCUMENTS', 'VIEW')
  async exportElements(@Param('projectId') projectId: string, @Query('revisionId') revisionId: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    if (!revisionId) throw new BadRequestException('Choose a model revision');
    const f = await this.bim.exportElements(projectId, user.sub, revisionId);
    send(res, f.buffer, f.filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  @Get('quantities')
  @RequirePermission('DOCUMENTS', 'VIEW')
  quantities(@Param('projectId') projectId: string, @Query('revisionId') revisionId: string, @CurrentUser() user: JwtPayload) {
    if (!revisionId) throw new BadRequestException('Choose a model revision');
    return this.bim.quantities(projectId, user.sub, revisionId);
  }

  @Get('diff')
  @RequirePermission('DOCUMENTS', 'VIEW')
  diff(@Param('projectId') projectId: string, @Query('documentId') documentId: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: JwtPayload) {
    if (!documentId || !from || !to) throw new BadRequestException('Choose a model and two revisions');
    return this.bim.diff(projectId, user.sub, documentId, from, to);
  }

  @Post('revisions/:revisionId/reprocess')
  @RequirePermission('DOCUMENTS', 'EDIT')
  reprocess(@Param('projectId') projectId: string, @Param('revisionId') revisionId: string, @CurrentUser() user: JwtPayload) {
    return this.bim.reprocess(projectId, user.sub, revisionId);
  }

  // ---- Federations

  @Get('federations')
  @RequirePermission('DOCUMENTS', 'VIEW')
  federations(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.bim.federations(projectId, user.sub);
  }

  @Post('federations')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  createFederation(@Param('projectId') projectId: string, @Body() dto: FederationDto, @CurrentUser() user: JwtPayload) {
    return this.bim.saveFederation(projectId, user.sub, dto);
  }

  @Patch('federations/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  updateFederation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: FederationDto, @CurrentUser() user: JwtPayload) {
    return this.bim.saveFederation(projectId, user.sub, dto, id);
  }

  @Delete('federations/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  deleteFederation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bim.deleteFederation(projectId, user.sub, id);
  }

  // ---- Clash detection

  @Get('clash-tests')
  @RequirePermission('DOCUMENTS', 'VIEW')
  clashTests(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.clash.tests(projectId, user.sub);
  }

  @Post('clash-tests')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  createClashTest(@Param('projectId') projectId: string, @Body() dto: ClashTestDto, @CurrentUser() user: JwtPayload) {
    return this.clash.save(projectId, user.sub, dto);
  }

  @Patch('clash-tests/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  updateClashTest(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ClashTestDto, @CurrentUser() user: JwtPayload) {
    return this.clash.save(projectId, user.sub, dto, id);
  }

  @Delete('clash-tests/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  deleteClashTest(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.clash.remove(projectId, user.sub, id);
  }

  @Post('clash-tests/:id/run')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  runClashTest(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.clash.run(projectId, user.sub, id);
  }

  @Get('clash-tests/:id/clashes')
  @RequirePermission('DOCUMENTS', 'VIEW')
  clashes(@Param('projectId') projectId: string, @Param('id') id: string, @Query('status') status: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.clash.clashes(projectId, user.sub, id, status);
  }

  @Patch('clashes/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  setClashStatus(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ClashStatusDto, @CurrentUser() user: JwtPayload) {
    return this.clash.setStatus(projectId, user.sub, id, dto);
  }

  @Post('clashes/:id/issue')
  @RequirePermission('ISSUES', 'CREATE')
  clashIssue(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ClashIssueDto, @CurrentUser() user: JwtPayload) {
    return this.clash.raiseIssue(projectId, user.sub, id, dto);
  }

  // ---- Smart views

  @Get('smart-views')
  @RequirePermission('DOCUMENTS', 'VIEW')
  smartViews(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.views.list(projectId, user.sub);
  }

  @Post('smart-views/preview')
  @RequirePermission('DOCUMENTS', 'VIEW')
  @HttpCode(HttpStatus.OK)
  previewSelection(@Param('projectId') projectId: string, @Body() dto: SelectionDto, @CurrentUser() user: JwtPayload) {
    return this.views.preview(projectId, user.sub, dto);
  }

  @Post('smart-views')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  createSmartView(@Param('projectId') projectId: string, @Body() dto: SmartViewDto, @CurrentUser() user: JwtPayload) {
    return this.views.save(projectId, user.sub, dto);
  }

  @Patch('smart-views/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  updateSmartView(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SmartViewDto, @CurrentUser() user: JwtPayload) {
    return this.views.save(projectId, user.sub, dto, id);
  }

  @Delete('smart-views/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  deleteSmartView(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.views.remove(projectId, user.sub, id);
  }

  @Get('smart-views/:id/apply')
  @RequirePermission('DOCUMENTS', 'VIEW')
  applySmartView(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.views.apply(projectId, user.sub, id);
  }

  // ---- BIM requirements

  @Get('requirements')
  @RequirePermission('DOCUMENTS', 'VIEW')
  requirementSets(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.reqs.list(projectId, user.sub);
  }

  @Post('requirements')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  createRequirementSet(@Param('projectId') projectId: string, @Body() dto: RequirementSetDto, @CurrentUser() user: JwtPayload) {
    return this.reqs.save(projectId, user.sub, dto);
  }

  @Post('requirements/import')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  @UseInterceptors(smallUpload)
  importRequirements(@Param('projectId') projectId: string, @Body('name') name: string | undefined, @CurrentUser() user: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.reqs.import(projectId, user.sub, file, name?.trim() || undefined);
  }

  @Get('requirements/checks/:checkId')
  @RequirePermission('DOCUMENTS', 'VIEW')
  requirementCheck(@Param('projectId') projectId: string, @Param('checkId') checkId: string, @CurrentUser() user: JwtPayload) {
    return this.reqs.check(projectId, user.sub, checkId);
  }

  @Get('requirements/:id')
  @RequirePermission('DOCUMENTS', 'VIEW')
  requirementSet(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reqs.get(projectId, user.sub, id);
  }

  @Patch('requirements/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  updateRequirementSet(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RequirementSetDto, @CurrentUser() user: JwtPayload) {
    return this.reqs.save(projectId, user.sub, dto, id);
  }

  @Delete('requirements/:id')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRequirementSet(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reqs.remove(projectId, user.sub, id);
  }

  @Post('requirements/:id/run')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  runRequirements(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RunCheckDto, @CurrentUser() user: JwtPayload) {
    return this.reqs.run(projectId, user.sub, id, dto.revisionId);
  }

  // ---- BCF

  @Get('bcf')
  @RequirePermission('ISSUES', 'VIEW')
  async exportBcf(@Param('projectId') projectId: string, @Query('documentIds') documentIds: string | undefined, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const f = await this.bcf.export(projectId, user.sub, documentIds?.split(',').filter(Boolean));
    send(res, f.buffer, f.filename, 'application/octet-stream');
  }

  @Post('bcf')
  @RequirePermission('ISSUES', 'CREATE')
  @UseInterceptors(smallUpload)
  importBcf(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.bcf.import(projectId, user.sub, file);
  }
}

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [BimController],
  providers: [BimService, ClashService, SmartViewsService, RequirementsService, BcfService],
})
export class BimModule {}
