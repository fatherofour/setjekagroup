import { Module } from '@nestjs/common';
import { ProjectNodesController } from './project-nodes.controller.js';
import { ProjectNodesService } from './project-nodes.service.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ProjectNodesController],
  providers: [ProjectNodesService],
})
export class ProjectNodesModule {}
