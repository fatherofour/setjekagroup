import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { HseService } from './hse.service.js';
import { IncidentActionDto, IncidentNoteDto, InvestigateIncidentDto, ReportIncidentDto } from './dto/hse.dto.js';

// Incidents sit with inspections in the permission matrix, as the other
// site records do: anyone on site reports, the client sees none. The
// service decides who investigates and closes.
@Controller('projects/:projectId/hse/incidents')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class HseController {
  constructor(private readonly hse: HseService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.hse.list(projectId, user.sub);
  }

  @Get('stats')
  @RequirePermission('INSPECTIONS', 'VIEW')
  stats(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.hse.stats(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.hse.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  report(@Param('projectId') projectId: string, @Body() dto: ReportIncidentDto, @CurrentUser() user: JwtPayload) {
    return this.hse.report(projectId, user.sub, dto);
  }

  @Patch(':id/investigation')
  @RequirePermission('INSPECTIONS', 'CREATE')
  investigate(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: InvestigateIncidentDto, @CurrentUser() user: JwtPayload) {
    return this.hse.investigate(projectId, user.sub, id, dto);
  }

  @Post(':id/actions')
  @RequirePermission('INSPECTIONS', 'CREATE')
  addAction(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: IncidentActionDto, @CurrentUser() user: JwtPayload) {
    return this.hse.addAction(projectId, user.sub, id, dto);
  }

  @Post(':id/actions/:actionId/done')
  @RequirePermission('INSPECTIONS', 'CREATE')
  completeAction(@Param('projectId') projectId: string, @Param('id') id: string, @Param('actionId') actionId: string, @Body() dto: IncidentNoteDto, @CurrentUser() user: JwtPayload) {
    return this.hse.completeAction(projectId, user.sub, id, actionId, dto.note);
  }

  @Post(':id/close')
  @RequirePermission('INSPECTIONS', 'CREATE')
  close(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: IncidentNoteDto, @CurrentUser() user: JwtPayload) {
    return this.hse.close(projectId, user.sub, id, dto.note);
  }
}
