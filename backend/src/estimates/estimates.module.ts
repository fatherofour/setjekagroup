import { Module } from '@nestjs/common';
import { CostDatabaseModule } from '../cost-database/cost-database.module.js';
import { EstimatesController } from './estimates.controller.js';
import { EstimatesService } from './estimates.service.js';
import { ConverterClient } from './converter.client.js';

@Module({
  imports: [CostDatabaseModule],
  controllers: [EstimatesController],
  providers: [EstimatesService, ConverterClient],
})
export class EstimatesModule {}
