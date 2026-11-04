import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PlantController } from './plant.controller.js';
import { PlantService } from './plant.service.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/** Plant and equipment on site (2026-11-04). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [PlantController],
  providers: [PlantService],
})
export class PlantModule {}
