import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TimeClaimsController } from './time-claims.controller.js';
import { TimeClaimsService } from './time-claims.service.js';

/** Delay notices and extension-of-time claims (2026-11-03). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [TimeClaimsController],
  providers: [TimeClaimsService],
})
export class TimeClaimsModule {}
