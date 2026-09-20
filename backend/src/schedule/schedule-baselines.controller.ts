import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ScheduleBaselinesService } from './schedule-baselines.service.js';
import { CreateBaselineDto } from './dto/create-baseline.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects/:projectId/schedule/baselines')
@UseGuards(JwtAccessGuard)
export class ScheduleBaselinesController {
  constructor(private readonly baselinesService: ScheduleBaselinesService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.baselinesService.findAll(projectId, user.sub);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateBaselineDto, @CurrentUser() user: JwtPayload) {
    return this.baselinesService.create(projectId, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.baselinesService.remove(projectId, user.sub, id);
  }
}
