import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SignoffModule } from '../signoff/signoff.module.js';
import { QsAccessService } from './qs-access.service.js';
import { CostPlansService } from './cost-plans.service.js';
import { ContractsService } from './contracts.service.js';
import { ValuationsService } from './valuations.service.js';
import { QsController } from './qs.controller.js';
import { SiteMeasureController } from './site-measure.controller.js';
import { SiteMeasureService } from './site-measure.service.js';

@Module({
  imports: [PermissionsModule, ProjectsModule, NotificationsModule, SignoffModule],
  controllers: [QsController, SiteMeasureController],
  providers: [QsAccessService, CostPlansService, ContractsService, ValuationsService, SiteMeasureService],
})
export class QsModule {}
