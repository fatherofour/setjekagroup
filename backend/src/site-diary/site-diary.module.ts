import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { SiteDiaryController } from './site-diary.controller.js';
import { SiteDiaryService } from './site-diary.service.js';
import { LookAheadController } from './look-ahead.controller.js';
import { LookAheadService } from './look-ahead.service.js';

/** The daily site diary and the look-ahead with progress (2026-11-04). */
@Module({
  imports: [ProjectsModule, PermissionsModule, ScheduleModule],
  controllers: [SiteDiaryController, LookAheadController],
  providers: [SiteDiaryService, LookAheadService],
})
export class SiteDiaryModule {}
