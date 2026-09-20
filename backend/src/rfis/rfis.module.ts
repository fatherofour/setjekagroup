import { Module } from '@nestjs/common';
import { RfisController } from './rfis.controller.js';
import { RfisService } from './rfis.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule],
  controllers: [RfisController],
  providers: [RfisService],
})
export class RfisModule {}
