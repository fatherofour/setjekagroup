import { Module } from '@nestjs/common';
import { OrganisationAppointmentsController } from './organisation-appointments.controller.js';
import { OrganisationAppointmentsService } from './organisation-appointments.service.js';
import { ContractorsModule } from '../contractors/contractors.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ContractorsModule, ProjectsModule],
  controllers: [OrganisationAppointmentsController],
  providers: [OrganisationAppointmentsService],
})
export class OrganisationAppointmentsModule {}
