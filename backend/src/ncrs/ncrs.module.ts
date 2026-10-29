import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NcrsController } from './ncrs.controller.js';
import { NcrsService } from './ncrs.service.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [NcrsController],
  providers: [NcrsService],
})
export class NcrsModule {}
