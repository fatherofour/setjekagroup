import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import { CreateDependencyDto } from './dto/create-dependency.dto.js';
import { UpdateDependencyDto } from './dto/update-dependency.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/schedule/dependencies')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ScheduleDependenciesController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  @RequirePermission('SCHEDULE', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.findAllDependencies(projectId, user.sub);
  }

  @Post()
  @RequirePermission('SCHEDULE', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateDependencyDto, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.createDependency(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('SCHEDULE', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDependencyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scheduleService.updateDependency(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('SCHEDULE', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.removeDependency(projectId, user.sub, id);
  }
}
