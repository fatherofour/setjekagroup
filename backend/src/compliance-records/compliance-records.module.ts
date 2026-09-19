import { Module } from '@nestjs/common';
import { ComplianceRecordsController } from './compliance-records.controller.js';
import { ComplianceRecordsService } from './compliance-records.service.js';
import { ContractorsModule } from '../contractors/contractors.module.js';

@Module({
  imports: [ContractorsModule],
  controllers: [ComplianceRecordsController],
  providers: [ComplianceRecordsService],
})
export class ComplianceRecordsModule {}
