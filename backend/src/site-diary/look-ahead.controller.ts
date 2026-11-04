import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { LookAheadService } from './look-ahead.service.js';

class ProgressDto {
  @IsInt() @Min(0) @Max(100) percentComplete!: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

// Progress is recorded on site, so it sits with the site records (the
// contractor can record their own; the client sees none), not with the
// programme's own edit permission.
@Controller('projects/:projectId/look-ahead')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class LookAheadController {
  constructor(private readonly lookAhead: LookAheadService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  get(@Param('projectId') projectId: string, @Query('weeks') weeks: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.lookAhead.lookAhead(projectId, user.sub, weeks ? Number(weeks) : 3);
  }

  @Get('activities/:activityId')
  @RequirePermission('INSPECTIONS', 'VIEW')
  history(@Param('projectId') projectId: string, @Param('activityId') activityId: string, @CurrentUser() user: JwtPayload) {
    return this.lookAhead.history(projectId, user.sub, activityId);
  }

  @Post('activities/:activityId/progress')
  @RequirePermission('INSPECTIONS', 'CREATE')
  record(@Param('projectId') projectId: string, @Param('activityId') activityId: string, @Body() dto: ProgressDto, @CurrentUser() user: JwtPayload) {
    return this.lookAhead.record(projectId, user.sub, activityId, dto.percentComplete, dto.note);
  }
}
