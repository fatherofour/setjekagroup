import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SignoffService } from './signoff.service.js';
import { DocumentApprovalsService } from './document-approvals.service.js';
import { ApprovalRecordsController, DocumentApprovalsController, MySignatureController } from './signoff.controller.js';

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [MySignatureController, ApprovalRecordsController, DocumentApprovalsController],
  providers: [SignoffService, DocumentApprovalsService],
  exports: [SignoffService],
})
export class SignoffModule {}
