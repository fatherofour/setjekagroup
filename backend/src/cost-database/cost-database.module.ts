import { Module } from '@nestjs/common';
import {
  CostCodesController,
  CostRegionsController,
  CostResourcesController,
  FxRatesController,
  WorkItemsController,
} from './cost-database.controller.js';
import { CostDatabaseService } from './cost-database.service.js';

@Module({
  controllers: [CostRegionsController, CostResourcesController, WorkItemsController, CostCodesController, FxRatesController],
  providers: [CostDatabaseService],
  exports: [CostDatabaseService],
})
export class CostDatabaseModule {}
