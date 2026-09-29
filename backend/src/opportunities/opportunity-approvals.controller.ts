import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpportunityApprovalsService } from './opportunity-approvals.service.js';
import { CreateApprovalDto } from './dto/create-approval.dto.js';
import { UpdateApprovalDto } from './dto/update-approval.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';

@Controller('opportunities/:opportunityId/approvals')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class OpportunityApprovalsController {
  constructor(private readonly approvalsService: OpportunityApprovalsService) {}

  @Get()
  findAll(@Param('opportunityId') opportunityId: string) {
    return this.approvalsService.findAll(opportunityId);
  }

  @Post()
  create(@Param('opportunityId') opportunityId: string, @Body() dto: CreateApprovalDto) {
    return this.approvalsService.create(opportunityId, dto);
  }

  @Patch(':id')
  update(@Param('opportunityId') opportunityId: string, @Param('id') id: string, @Body() dto: UpdateApprovalDto) {
    return this.approvalsService.update(opportunityId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('opportunityId') opportunityId: string, @Param('id') id: string) {
    return this.approvalsService.remove(opportunityId, id);
  }
}
