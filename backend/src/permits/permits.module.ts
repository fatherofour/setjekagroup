import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermitsController } from './permits.controller.js';
import { PermitsService } from './permits.service.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/** Permits to work (2026-11-04). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [PermitsController],
  providers: [PermitsService],
})
export class PermitsModule {}
