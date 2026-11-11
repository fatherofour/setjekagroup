import { Module } from '@nestjs/common';
import { ProjectDashboardController } from './project-dashboard.controller.js';
import { ProjectDashboardService } from './project-dashboard.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { CommentsModule } from '../comments/comments.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, CommentsModule],
  controllers: [ProjectDashboardController],
  providers: [ProjectDashboardService],
})
export class ProjectDashboardModule {}
