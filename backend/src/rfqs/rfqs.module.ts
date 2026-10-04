import { CostDatabaseModule } from '../cost-database/cost-database.module.js';
import { Module } from '@nestjs/common';
import { RfqsController } from './rfqs.controller.js';
import { RfqsService } from './rfqs.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule, CostDatabaseModule],
  controllers: [RfqsController],
  providers: [RfqsService],
  exports: [RfqsService],
})
export class RfqsModule {}
