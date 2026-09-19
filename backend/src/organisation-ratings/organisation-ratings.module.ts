import { Module } from '@nestjs/common';
import { OrganisationRatingsController } from './organisation-ratings.controller.js';
import { OrganisationRatingsService } from './organisation-ratings.service.js';
import { ContractorsModule } from '../contractors/contractors.module.js';

@Module({
  imports: [ContractorsModule],
  controllers: [OrganisationRatingsController],
  providers: [OrganisationRatingsService],
})
export class OrganisationRatingsModule {}
