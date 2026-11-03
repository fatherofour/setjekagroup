import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { QualityTestsController } from './quality-tests.controller.js';
import { QualityTestsService } from './quality-tests.service.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [QualityTestsController],
  providers: [QualityTestsService],
})
export class QualityTestsModule {}
