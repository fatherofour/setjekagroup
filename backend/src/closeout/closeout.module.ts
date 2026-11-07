import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuditLogModule } from '../audit-log/audit-log.module.js';
import { SignoffModule } from '../signoff/signoff.module.js';
import { CloseoutController } from './closeout.controller.js';
import { CloseoutService } from './closeout.service.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, AuditLogModule, SignoffModule],
  controllers: [CloseoutController],
  providers: [CloseoutService],
})
export class CloseoutModule {}
