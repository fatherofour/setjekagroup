import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { OpportunityApprovalsController } from './opportunity-approvals.controller.js';
import { OpportunityApprovalsService } from './opportunity-approvals.service.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ProjectsModule],
  controllers: [OpportunitiesController, OpportunityApprovalsController],
  providers: [OpportunitiesService, OpportunityApprovalsService],
})
export class OpportunitiesModule {}
