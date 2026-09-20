import { Module } from '@nestjs/common';
import { ScheduleActivitiesController } from './schedule-activities.controller.js';
import { ScheduleDependenciesController } from './schedule-dependencies.controller.js';
import { ScheduleBaselinesController } from './schedule-baselines.controller.js';
import { ScheduleImportController } from './schedule-import.controller.js';
import { ScheduleService } from './schedule.service.js';
import { ScheduleBaselinesService } from './schedule-baselines.service.js';
import { ScheduleImportService } from './schedule-import.service.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ScheduleActivitiesController, ScheduleDependenciesController, ScheduleBaselinesController, ScheduleImportController],
  providers: [ScheduleService, ScheduleBaselinesService, ScheduleImportService],
})
export class ScheduleModule {}
