import { Module } from '@nestjs/common';
import { DocumentFoldersController } from './document-folders.controller.js';
import { DocumentFoldersService } from './document-folders.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [DocumentFoldersController],
  providers: [DocumentFoldersService],
})
export class DocumentFoldersModule {}
