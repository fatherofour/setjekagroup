import { Module } from '@nestjs/common';
import { SubmittalsController } from './submittals.controller.js';
import { SubmittalsService } from './submittals.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [SubmittalsController],
  providers: [SubmittalsService],
})
export class SubmittalsModule {}
