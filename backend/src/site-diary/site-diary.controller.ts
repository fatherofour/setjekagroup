import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { SiteDiaryService } from './site-diary.service.js';
import { SaveDiaryDto } from './dto/site-diary.dto.js';

// The diary sits with the other site records under inspections in the
// permission matrix (the client none); the service lets the site manager
// and Setjeka write it.
@Controller('projects/:projectId/site-diary')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class SiteDiaryController {
  constructor(private readonly diary: SiteDiaryService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.diary.list(projectId, user.sub, from, to);
  }

  @Get(':date')
  @RequirePermission('INSPECTIONS', 'VIEW')
  day(@Param('projectId') projectId: string, @Param('date') date: string, @CurrentUser() user: JwtPayload) {
    return this.diary.day(projectId, user.sub, date);
  }

  @Put(':date')
  @RequirePermission('INSPECTIONS', 'CREATE')
  save(@Param('projectId') projectId: string, @Param('date') date: string, @Body() dto: SaveDiaryDto, @CurrentUser() user: JwtPayload) {
    return this.diary.save(projectId, user.sub, date, dto);
  }

  @Post(':date/sign')
  @RequirePermission('INSPECTIONS', 'CREATE')
  sign(@Param('projectId') projectId: string, @Param('date') date: string, @CurrentUser() user: JwtPayload) {
    return this.diary.sign(projectId, user.sub, date);
  }
}
