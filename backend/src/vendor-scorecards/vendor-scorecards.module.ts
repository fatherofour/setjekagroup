import { Module } from '@nestjs/common';
import { VendorScorecardsController } from './vendor-scorecards.controller.js';
import { VendorScorecardsService } from './vendor-scorecards.service.js';
import { ContractorsModule } from '../contractors/contractors.module.js';

@Module({
  imports: [ContractorsModule],
  controllers: [VendorScorecardsController],
  providers: [VendorScorecardsService],
})
export class VendorScorecardsModule {}
