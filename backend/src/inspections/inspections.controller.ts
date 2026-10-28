import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { InspectionsService } from './inspections.service.js';
import { CompleteInspectionDto, CreateInspectionDto, InspectionIssueDto, InspectionQuery, ScheduleInspectionDto, TemplateDto, UpdateInspectionDto } from './dto/inspection.dto.js';

@Controller('projects/:projectId/inspections')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @Query() query: InspectionQuery, @CurrentUser() user: JwtPayload) {
    return this.inspections.list(projectId, user.sub, query);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.inspections.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateInspectionDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.create(projectId, user.sub, dto);
  }

  @Post(':id/schedule')
  @RequirePermission('INSPECTIONS', 'EDIT')
  schedule(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ScheduleInspectionDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.schedule(projectId, user.sub, id, dto.inspectorId, dto.scheduledFor);
  }

  @Patch(':id')
  @RequirePermission('INSPECTIONS', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateInspectionDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.update(projectId, user.sub, id, dto);
  }

  @Post(':id/complete')
  @RequirePermission('INSPECTIONS', 'EDIT')
  complete(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CompleteInspectionDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.complete(projectId, user.sub, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('INSPECTIONS', 'CREATE')
  cancel(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.inspections.cancel(projectId, user.sub, id);
  }

  @Post(':id/issues')
  @RequirePermission('INSPECTIONS', 'EDIT')
  raiseIssue(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: InspectionIssueDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.raiseIssue(projectId, user.sub, id, dto);
  }
}

/** Company-wide checklists. Anyone signed in reads them to pick one;
 * Setjeka edits them. */
@Controller('inspection-templates')
@UseGuards(JwtAccessGuard)
export class InspectionTemplatesController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  list(@Query('all') all?: string) {
    return this.inspections.templates(all === '1');
  }

  @Post()
  create(@Body() dto: TemplateDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.createTemplate(user.sub, dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: TemplateDto, @CurrentUser() user: JwtPayload) {
    return this.inspections.updateTemplate(user.sub, id, dto);
  }
}
