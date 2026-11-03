import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { HseController } from './hse.controller.js';
import { HseService } from './hse.service.js';

/** HSE incidents (2026-11-04). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [HseController],
  providers: [HseService],
})
export class HseModule {}
