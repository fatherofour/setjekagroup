import { SignoffModule } from '../signoff/signoff.module.js';
import { Module } from '@nestjs/common';
import { StageTransitionsController } from './stage-transitions.controller.js';
import { StageTransitionsService } from './stage-transitions.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { InceptionModule } from '../inception/inception.module.js';
import { AuditLogModule } from '../audit-log/audit-log.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule, InceptionModule, SignoffModule, AuditLogModule],
  controllers: [StageTransitionsController],
  providers: [StageTransitionsService],
})
export class StageTransitionsModule {}
