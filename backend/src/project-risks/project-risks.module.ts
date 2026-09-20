import { Module } from '@nestjs/common';
import { ProjectRisksController } from './project-risks.controller.js';
import { ProjectRisksService } from './project-risks.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [ProjectRisksController],
  providers: [ProjectRisksService],
})
export class ProjectRisksModule {}
