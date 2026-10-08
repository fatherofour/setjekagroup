import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { NotificationsService } from './notifications.service.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import type { AlertCategory } from './categories.js';

class AlertPreferencesDto {
  @IsArray()
  @IsString({ each: true })
  muted!: string[];
}

@Controller('notifications')
@UseGuards(JwtAccessGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: AlertCategory,
    @Query('unread') unread?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.notificationsService.findAllForUser(user.sub, { category, unread: unread === '1' || unread === 'true', projectId });
  }

  @Get('preferences')
  preferences(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.preferences(user.sub);
  }

  @Put('preferences')
  setPreferences(@CurrentUser() user: JwtPayload, @Body() dto: AlertPreferencesDto) {
    return this.notificationsService.setPreferences(user.sub, dto.muted);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Patch(':id/unread')
  markUnread(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.markUnread(user.sub, id);
  }
}
