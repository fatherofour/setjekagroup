import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { QualityTestsService } from './quality-tests.service.js';
import { CriterionDto, HoldPointCommentDto, HoldPointDto, HoldPointReasonDto, NotifyHoldPointDto, RecordTestDto, ReviewTestDto, UpdateCriterionDto } from './dto/quality.dto.js';

// Quality work sits with inspections in the permission matrix, as NCRs do:
// contractors create (their results and notices), consultants and Setjeka
// edit. The service decides who sets, records, reviews and releases.
@Controller('projects/:projectId/quality')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class QualityTestsController {
  constructor(private readonly quality: QualityTestsService) {}

  @Get('options')
  @RequirePermission('INSPECTIONS', 'VIEW')
  options(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.quality.options(projectId, user.sub);
  }

  @Get('criteria')
  @RequirePermission('INSPECTIONS', 'VIEW')
  criteria(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.quality.criteria(projectId, user.sub);
  }

  @Post('criteria')
  @RequirePermission('INSPECTIONS', 'EDIT')
  createCriterion(@Param('projectId') projectId: string, @Body() dto: CriterionDto, @CurrentUser() user: JwtPayload) {
    return this.quality.createCriterion(projectId, user.sub, dto);
  }

  @Post('criteria/starter')
  @RequirePermission('INSPECTIONS', 'EDIT')
  addStarter(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.quality.addStarter(projectId, user.sub);
  }

  @Patch('criteria/:id')
  @RequirePermission('INSPECTIONS', 'EDIT')
  updateCriterion(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateCriterionDto, @CurrentUser() user: JwtPayload) {
    return this.quality.updateCriterion(projectId, user.sub, id, dto);
  }

  @Get('tests')
  @RequirePermission('INSPECTIONS', 'VIEW')
  tests(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.quality.tests(projectId, user.sub);
  }

  @Get('tests/:id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  test(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.quality.test(projectId, user.sub, id);
  }

  @Post('tests')
  @RequirePermission('INSPECTIONS', 'CREATE')
  record(@Param('projectId') projectId: string, @Body() dto: RecordTestDto, @CurrentUser() user: JwtPayload) {
    return this.quality.record(projectId, user.sub, dto);
  }

  @Post('tests/:id/review')
  @RequirePermission('INSPECTIONS', 'EDIT')
  review(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ReviewTestDto, @CurrentUser() user: JwtPayload) {
    return this.quality.review(projectId, user.sub, id, dto.comment);
  }

  @Get('hold-points')
  @RequirePermission('INSPECTIONS', 'VIEW')
  points(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.quality.points(projectId, user.sub);
  }

  @Get('hold-points/:id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  point(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.quality.point(projectId, user.sub, id);
  }

  @Post('hold-points')
  @RequirePermission('INSPECTIONS', 'EDIT')
  createPoint(@Param('projectId') projectId: string, @Body() dto: HoldPointDto, @CurrentUser() user: JwtPayload) {
    return this.quality.createPoint(projectId, user.sub, dto);
  }

  @Post('hold-points/:id/notify')
  @RequirePermission('INSPECTIONS', 'CREATE')
  notify(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: NotifyHoldPointDto, @CurrentUser() user: JwtPayload) {
    return this.quality.notify(projectId, user.sub, id, dto);
  }

  @Post('hold-points/:id/release')
  @RequirePermission('INSPECTIONS', 'EDIT')
  release(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: HoldPointCommentDto, @CurrentUser() user: JwtPayload) {
    return this.quality.release(projectId, user.sub, id, dto.comment);
  }

  @Post('hold-points/:id/not-ready')
  @RequirePermission('INSPECTIONS', 'EDIT')
  notReady(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: HoldPointReasonDto, @CurrentUser() user: JwtPayload) {
    return this.quality.notReady(projectId, user.sub, id, dto.reason);
  }

  @Post('hold-points/:id/proceed')
  @RequirePermission('INSPECTIONS', 'CREATE')
  proceed(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: HoldPointCommentDto, @CurrentUser() user: JwtPayload) {
    return this.quality.proceed(projectId, user.sub, id, dto.comment);
  }

  @Post('hold-points/:id/cancel')
  @RequirePermission('INSPECTIONS', 'EDIT')
  cancel(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: HoldPointReasonDto, @CurrentUser() user: JwtPayload) {
    return this.quality.cancel(projectId, user.sub, id, dto.reason);
  }
}
