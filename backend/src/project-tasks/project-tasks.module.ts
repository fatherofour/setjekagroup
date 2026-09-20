import { Module } from '@nestjs/common';
import { ProjectTasksController } from './project-tasks.controller.js';
import { ProjectTasksService } from './project-tasks.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule],
  controllers: [ProjectTasksController],
  providers: [ProjectTasksService],
})
export class ProjectTasksModule {}
