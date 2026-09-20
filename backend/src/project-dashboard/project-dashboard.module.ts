import { Module } from '@nestjs/common';
import { ProjectDashboardController } from './project-dashboard.controller.js';
import { ProjectDashboardService } from './project-dashboard.service.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ProjectDashboardController],
  providers: [ProjectDashboardService],
})
export class ProjectDashboardModule {}
