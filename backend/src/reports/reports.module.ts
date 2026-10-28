import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { CommercialModule } from '../commercial/commercial.module.js';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [ProjectsModule, CommercialModule, DeliveryModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
