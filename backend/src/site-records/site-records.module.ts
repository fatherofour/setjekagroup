import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { HiddenWorksController, InterfacesController } from './site-records.controller.js';
import { InterfacesService } from './interfaces.service.js';
import { HiddenWorksService } from './hidden-works.service.js';

/** The interfaces register and hidden-works sign-off (2026-11-03). */
@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [InterfacesController, HiddenWorksController],
  providers: [InterfacesService, HiddenWorksService],
})
export class SiteRecordsModule {}
