import { Module } from '@nestjs/common';
import { CommercialModule } from '../commercial/commercial.module.js';
import { CostDatabaseModule } from '../cost-database/cost-database.module.js';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioService } from './portfolio.service.js';

/** The portfolio dashboard (2026-11-04). */
@Module({
  imports: [CommercialModule, CostDatabaseModule, ScheduleModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
