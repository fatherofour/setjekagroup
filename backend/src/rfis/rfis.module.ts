import { Module } from '@nestjs/common';
import { RfisController } from './rfis.controller.js';
import { RfisService } from './rfis.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [RfisController],
  providers: [RfisService],
})
export class RfisModule {}
