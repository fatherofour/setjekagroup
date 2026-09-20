import { Module } from '@nestjs/common';
import { SubmittalsController } from './submittals.controller.js';
import { SubmittalsService } from './submittals.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule],
  controllers: [SubmittalsController],
  providers: [SubmittalsService],
})
export class SubmittalsModule {}
