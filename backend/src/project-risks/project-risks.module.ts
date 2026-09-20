import { Module } from '@nestjs/common';
import { ProjectRisksController } from './project-risks.controller.js';
import { ProjectRisksService } from './project-risks.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule],
  controllers: [ProjectRisksController],
  providers: [ProjectRisksService],
})
export class ProjectRisksModule {}
