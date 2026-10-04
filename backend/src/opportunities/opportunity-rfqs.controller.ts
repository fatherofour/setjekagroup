import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OpportunityRfqsService, type RfqOwner } from './opportunity-rfqs.service.js';
import {
  AwardRfqDto,
  CreateOpportunityRfqDto,
  InviteConsultantDto,
  RecordOpportunityQuoteDto,
  UpdateOpportunityRfqDto,
} from './dto/opportunity-rfq.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

const opp = (id: string): RfqOwner => ({ kind: 'opportunity', id });
const proj = (id: string): RfqOwner => ({ kind: 'project', id });

@Controller('opportunities/:opportunityId')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class OpportunityRfqsController {
  constructor(private readonly rfqs: OpportunityRfqsService) {}

  @Get('rfqs')
  findAll(@Param('opportunityId') id: string) {
    return this.rfqs.findAll(opp(id));
  }

  @Post('rfqs')
  create(@Param('opportunityId') id: string, @Body() dto: CreateOpportunityRfqDto, @CurrentUser() user: JwtPayload) {
    return this.rfqs.create(opp(id), user.sub, dto);
  }

  @Get('rfqs/:rfqId')
  findOne(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.findOne(opp(id), rfqId);
  }

  @Patch('rfqs/:rfqId')
  update(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string, @Body() dto: UpdateOpportunityRfqDto) {
    return this.rfqs.update(opp(id), rfqId, dto);
  }

  @Post('rfqs/:rfqId/invite')
  invite(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string, @Body() dto: InviteConsultantDto) {
    return this.rfqs.invite(opp(id), rfqId, dto.contractorId);
  }

  @Post('rfqs/:rfqId/issue')
  issue(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.setStatus(opp(id), rfqId, 'ISSUED');
  }

  @Post('rfqs/:rfqId/close')
  close(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.setStatus(opp(id), rfqId, 'CLOSED');
  }

  @Post('rfqs/:rfqId/cancel')
  cancel(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.setStatus(opp(id), rfqId, 'CANCELLED');
  }

  @Post('rfqs/:rfqId/quotes')
  recordQuote(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string, @Body() dto: RecordOpportunityQuoteDto, @CurrentUser() user: JwtPayload) {
    return this.rfqs.recordQuote(opp(id), rfqId, user.sub, dto);
  }

  @Post('rfqs/:rfqId/quotes/:quoteId/withdraw')
  withdrawQuote(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string, @Param('quoteId') quoteId: string) {
    return this.rfqs.withdrawQuote(opp(id), rfqId, quoteId);
  }

  @Post('rfqs/:rfqId/award')
  award(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string, @Body() dto: AwardRfqDto, @CurrentUser() user: JwtPayload) {
    return this.rfqs.award(opp(id), rfqId, user.sub, dto);
  }

  @Delete('rfqs/:rfqId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('opportunityId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.remove(opp(id), rfqId);
  }

  @Get('appointments')
  findAppointments(@Param('opportunityId') id: string) {
    return this.rfqs.findAppointments(id);
  }

  @Delete('appointments/:appointmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeAppointment(@Param('opportunityId') id: string, @Param('appointmentId') appointmentId: string) {
    return this.rfqs.revokeAppointment(id, appointmentId);
  }
}

/** The same consultant RFQs on a live project (PROCSA Stage 1: DM 1.4,
 * PM 1.3 — appointing the rest of the professional team), under the
 * project's PROCUREMENT permissions. Internal staff only: the ranking shows
 * every bidder's fee, and the consultants on the team are often bidders
 * themselves — firms see their own RFQs through the vendor portal. */
@Controller('projects/:projectId/consultant-rfqs')
@UseGuards(JwtAccessGuard, InternalOnlyGuard, PermissionsGuard)
export class ProjectConsultantRfqsController {
  constructor(private readonly rfqs: OpportunityRfqsService) {}

  @Get()
  @RequirePermission('PROCUREMENT', 'VIEW')
  findAll(@Param('projectId') id: string) {
    return this.rfqs.findAll(proj(id));
  }

  @Post()
  @RequirePermission('PROCUREMENT', 'CREATE')
  create(@Param('projectId') id: string, @Body() dto: CreateOpportunityRfqDto, @CurrentUser() user: JwtPayload) {
    return this.rfqs.create(proj(id), user.sub, dto);
  }

  @Patch(':rfqId')
  @RequirePermission('PROCUREMENT', 'EDIT')
  update(@Param('projectId') id: string, @Param('rfqId') rfqId: string, @Body() dto: UpdateOpportunityRfqDto) {
    return this.rfqs.update(proj(id), rfqId, dto);
  }

  @Post(':rfqId/invite')
  @RequirePermission('PROCUREMENT', 'EDIT')
  invite(@Param('projectId') id: string, @Param('rfqId') rfqId: string, @Body() dto: InviteConsultantDto) {
    return this.rfqs.invite(proj(id), rfqId, dto.contractorId);
  }

  @Post(':rfqId/issue')
  @RequirePermission('PROCUREMENT', 'EDIT')
  issue(@Param('projectId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.setStatus(proj(id), rfqId, 'ISSUED');
  }

  @Post(':rfqId/close')
  @RequirePermission('PROCUREMENT', 'EDIT')
  close(@Param('projectId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.setStatus(proj(id), rfqId, 'CLOSED');
  }

  @Post(':rfqId/cancel')
  @RequirePermission('PROCUREMENT', 'EDIT')
  cancel(@Param('projectId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.setStatus(proj(id), rfqId, 'CANCELLED');
  }

  @Post(':rfqId/quotes')
  @RequirePermission('PROCUREMENT', 'EDIT')
  recordQuote(@Param('projectId') id: string, @Param('rfqId') rfqId: string, @Body() dto: RecordOpportunityQuoteDto, @CurrentUser() user: JwtPayload) {
    return this.rfqs.recordQuote(proj(id), rfqId, user.sub, dto);
  }

  @Post(':rfqId/quotes/:quoteId/withdraw')
  @RequirePermission('PROCUREMENT', 'EDIT')
  withdrawQuote(@Param('projectId') id: string, @Param('rfqId') rfqId: string, @Param('quoteId') quoteId: string) {
    return this.rfqs.withdrawQuote(proj(id), rfqId, quoteId);
  }

  @Post(':rfqId/award')
  @RequirePermission('PROCUREMENT', 'APPROVE')
  award(@Param('projectId') id: string, @Param('rfqId') rfqId: string, @Body() dto: AwardRfqDto, @CurrentUser() user: JwtPayload) {
    return this.rfqs.award(proj(id), rfqId, user.sub, dto);
  }

  @Delete(':rfqId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROCUREMENT', 'DELETE')
  remove(@Param('projectId') id: string, @Param('rfqId') rfqId: string) {
    return this.rfqs.remove(proj(id), rfqId);
  }
}

@Controller('consultants')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class ConsultantsController {
  constructor(private readonly rfqs: OpportunityRfqsService) {}

  @Get('disciplines')
  disciplines() {
    return this.rfqs.disciplines();
  }

  @Get()
  forDiscipline(@Query('discipline') discipline = '') {
    return this.rfqs.consultantsForDiscipline(discipline);
  }
}
