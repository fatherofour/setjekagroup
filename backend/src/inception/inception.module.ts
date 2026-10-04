import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { InceptionController } from './inception.controller.js';
import { InceptionService } from './inception.service.js';
import { InceptionStateService } from './inception-state.service.js';
import { DeliverablesService } from './deliverables.service.js';
import { RegistersService } from './registers.service.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule, ScheduleModule],
  controllers: [InceptionController],
  providers: [InceptionService, InceptionStateService, DeliverablesService, RegistersService],
  exports: [DeliverablesService],
})
export class InceptionModule {}
