import { Module } from '@nestjs/common';
import { ProjectNodesController } from './project-nodes.controller.js';
import { ProjectNodesService } from './project-nodes.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [ProjectNodesController],
  providers: [ProjectNodesService],
})
export class ProjectNodesModule {}
