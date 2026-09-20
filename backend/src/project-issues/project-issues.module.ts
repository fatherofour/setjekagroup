import { Module } from '@nestjs/common';
import { ProjectIssuesController } from './project-issues.controller.js';
import { ProjectIssuesService } from './project-issues.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [ProjectIssuesController],
  providers: [ProjectIssuesService],
})
export class ProjectIssuesModule {}
