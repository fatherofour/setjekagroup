import { Module } from '@nestjs/common';
import { InspectionTemplatesController, InspectionsController } from './inspections.controller.js';
import { InspectionsService } from './inspections.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [InspectionsController, InspectionTemplatesController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
