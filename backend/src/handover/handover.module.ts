import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { HandoverController } from './handover.controller.js';
import { HandoverService } from './handover.service.js';

/** The handover pack (2026-11-03). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [HandoverController],
  providers: [HandoverService],
})
export class HandoverModule {}
