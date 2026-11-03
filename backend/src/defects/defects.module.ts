import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DefectsController } from './defects.controller.js';
import { DefectsService } from './defects.service.js';

/** Completion certificates and the defects liability period (2026-11-03). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [DefectsController],
  providers: [DefectsService],
})
export class DefectsModule {}
