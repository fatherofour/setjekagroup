import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { SiteDiaryController } from './site-diary.controller.js';
import { SiteDiaryService } from './site-diary.service.js';

/** The daily site diary (2026-11-04). */
@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [SiteDiaryController],
  providers: [SiteDiaryService],
})
export class SiteDiaryModule {}
