import { Module } from '@nestjs/common';
import { SitePhotosController } from './site-photos.controller.js';
import { SitePhotosService } from './site-photos.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [SitePhotosController],
  providers: [SitePhotosService],
})
export class SitePhotosModule {}
