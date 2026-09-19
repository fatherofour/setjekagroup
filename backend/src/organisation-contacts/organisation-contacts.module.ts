import { Module } from '@nestjs/common';
import { OrganisationContactsController } from './organisation-contacts.controller.js';
import { OrganisationContactsService } from './organisation-contacts.service.js';
import { ContractorsModule } from '../contractors/contractors.module.js';

@Module({
  imports: [ContractorsModule],
  controllers: [OrganisationContactsController],
  providers: [OrganisationContactsService],
})
export class OrganisationContactsModule {}
