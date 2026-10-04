import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { MeetingsService } from './meetings.service.js';
import { CreateActionItemDto, CreateMeetingDto, RecordAttendanceDto, UpdateMeetingDto } from './dto/meeting.dto.js';

@Controller('projects/:projectId/meetings')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  @RequirePermission('MEETINGS', 'VIEW')
  findAll(@Param('projectId') projectId: string) {
    return this.meetings.findAll(projectId);
  }

  @Get(':id')
  @RequirePermission('MEETINGS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.meetings.findOne(projectId, id);
  }

  @Post()
  @RequirePermission('MEETINGS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateMeetingDto, @CurrentUser() user: JwtPayload) {
    return this.meetings.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('MEETINGS', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateMeetingDto, @CurrentUser() user: JwtPayload) {
    return this.meetings.update(projectId, user.sub, id, dto);
  }

  @Post(':id/attendance')
  @RequirePermission('MEETINGS', 'EDIT')
  attendance(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RecordAttendanceDto) {
    return this.meetings.recordAttendance(projectId, id, dto);
  }

  @Post(':id/issue-minutes')
  @RequirePermission('MEETINGS', 'EDIT')
  issueMinutes(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.meetings.issueMinutes(projectId, user.sub, id);
  }

  @Post(':id/action-items')
  @RequirePermission('MEETINGS', 'EDIT')
  addActionItem(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CreateActionItemDto) {
    return this.meetings.addActionItem(projectId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MEETINGS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.meetings.remove(projectId, id);
  }
}
