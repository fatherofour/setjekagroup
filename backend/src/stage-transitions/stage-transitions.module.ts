import { Module } from '@nestjs/common';
import { StageTransitionsController } from './stage-transitions.controller.js';
import { StageTransitionsService } from './stage-transitions.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule],
  controllers: [StageTransitionsController],
  providers: [StageTransitionsService],
})
export class StageTransitionsModule {}
