import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { OpportunityApprovalsController } from './opportunity-approvals.controller.js';
import { OpportunityApprovalsService } from './opportunity-approvals.service.js';
import { OpportunitySitesController } from './opportunity-sites.controller.js';
import { OpportunitySitesService } from './opportunity-sites.service.js';
import { ConsultantsController, OpportunityRfqsController, ProjectConsultantRfqsController } from './opportunity-rfqs.controller.js';
import { OpportunityRfqsService } from './opportunity-rfqs.service.js';
import { OpportunityStage0Controller } from './opportunity-stage0.controller.js';
import { OpportunityRegistersService } from './opportunity-registers.service.js';
import { InvestmentDecisionsService } from './investment-decisions.service.js';
import { OpportunityDocumentsService } from './opportunity-documents.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [
    OpportunitiesController,
    OpportunityApprovalsController,
    OpportunitySitesController,
    OpportunityRfqsController,
    ProjectConsultantRfqsController,
    ConsultantsController,
    OpportunityStage0Controller,
  ],
  providers: [
    OpportunitiesService,
    OpportunityApprovalsService,
    OpportunitySitesService,
    OpportunityRfqsService,
    OpportunityRegistersService,
    InvestmentDecisionsService,
    OpportunityDocumentsService,
  ],
})
export class OpportunitiesModule {}
