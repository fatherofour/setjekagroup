import { Module } from '@nestjs/common';
import { CommentsController, MyNotesController, OpportunityNotesController, ProjectActionsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { RecordAccessService } from './record-access.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, NotificationsModule, PermissionsModule],
  controllers: [CommentsController, ProjectActionsController, MyNotesController, OpportunityNotesController],
  providers: [CommentsService, RecordAccessService],
  exports: [RecordAccessService],
})
export class CommentsModule {}
