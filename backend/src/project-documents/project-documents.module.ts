import { Module } from '@nestjs/common';
import { ProjectDocumentsController } from './project-documents.controller.js';
import { ProjectDocumentsService } from './project-documents.service.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ProjectDocumentsController],
  providers: [ProjectDocumentsService],
})
export class ProjectDocumentsModule {}
