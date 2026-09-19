import { Module } from '@nestjs/common';
import { PaymentRecordsController } from './payment-records.controller.js';
import { PaymentRecordsService } from './payment-records.service.js';
import { ContractorsModule } from '../contractors/contractors.module.js';

@Module({
  imports: [ContractorsModule],
  controllers: [PaymentRecordsController],
  providers: [PaymentRecordsService],
})
export class PaymentRecordsModule {}
