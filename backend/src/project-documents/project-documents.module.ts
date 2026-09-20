import { Module } from '@nestjs/common';
import { ProjectDocumentsController } from './project-documents.controller.js';
import { ProjectDocumentsService } from './project-documents.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [ProjectDocumentsController],
  providers: [ProjectDocumentsService],
})
export class ProjectDocumentsModule {}
