import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects/:projectId/schedule/activities')
@UseGuards(JwtAccessGuard)
export class ScheduleActivitiesController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.findAllActivities(projectId, user.sub);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateActivityDto, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.createActivity(projectId, user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scheduleService.updateActivity(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.removeActivity(projectId, user.sub, id);
  }
}
