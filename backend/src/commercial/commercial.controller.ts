import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { CommercialService } from './commercial.service.js';
import {
  AssessVariationDto,
  BudgetLineDto,
  CreateInvoiceDto,
  CreateVariationDto,
  DecideVariationDto,
  PayInvoiceDto,
  RejectInvoiceDto,
  UpdateBudgetDto,
  UpdateBudgetLineDto,
  UpdateInvoiceDto,
  UpdateVariationDto,
  VariationActionDto,
} from './dto/commercial.dto.js';

@Controller('projects/:projectId/commercial')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class CommercialController {
  constructor(private readonly commercial: CommercialService) {}

  @Get('summary')
  @RequirePermission('COMMERCIAL', 'VIEW')
  summary(@Param('projectId') projectId: string) {
    return this.commercial.summary(projectId);
  }

  // ---- Budget

  @Get('budget')
  @RequirePermission('COMMERCIAL', 'VIEW')
  budget(@Param('projectId') projectId: string) {
    return this.commercial.getBudget(projectId);
  }

  @Put('budget')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updateBudget(@Param('projectId') projectId: string, @Body() dto: UpdateBudgetDto) {
    return this.commercial.updateBudget(projectId, dto);
  }

  @Post('budget/lines')
  @RequirePermission('COMMERCIAL', 'CREATE')
  addBudgetLine(@Param('projectId') projectId: string, @Body() dto: BudgetLineDto) {
    return this.commercial.addBudgetLine(projectId, dto);
  }

  @Patch('budget/lines/:lineId')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updateBudgetLine(@Param('projectId') projectId: string, @Param('lineId') lineId: string, @Body() dto: UpdateBudgetLineDto) {
    return this.commercial.updateBudgetLine(projectId, lineId, dto);
  }

  @Delete('budget/lines/:lineId')
  @RequirePermission('COMMERCIAL', 'DELETE')
  removeBudgetLine(@Param('projectId') projectId: string, @Param('lineId') lineId: string) {
    return this.commercial.removeBudgetLine(projectId, lineId);
  }

  @Post('budget/lock')
  @RequirePermission('COMMERCIAL', 'EDIT')
  lock(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.commercial.lockBudget(projectId, user.sub, true);
  }

  @Post('budget/unlock')
  @RequirePermission('COMMERCIAL', 'EDIT')
  unlock(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.commercial.lockBudget(projectId, user.sub, false);
  }

  // ---- Variations

  @Get('variations')
  @RequirePermission('COMMERCIAL', 'VIEW')
  variations(@Param('projectId') projectId: string) {
    return this.commercial.listVariations(projectId);
  }

  @Post('variations')
  @RequirePermission('COMMERCIAL', 'CREATE')
  createVariation(@Param('projectId') projectId: string, @Body() dto: CreateVariationDto, @CurrentUser() user: JwtPayload) {
    return this.commercial.createVariation(projectId, user.sub, dto);
  }

  @Patch('variations/:id')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updateVariation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateVariationDto) {
    return this.commercial.updateVariation(projectId, id, dto);
  }

  @Post('variations/:id/assess')
  @RequirePermission('COMMERCIAL', 'EDIT')
  assess(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: AssessVariationDto, @CurrentUser() user: JwtPayload) {
    return this.commercial.assessVariation(projectId, id, user.sub, dto);
  }

  @Post('variations/:id/submit')
  @RequirePermission('COMMERCIAL', 'EDIT')
  submit(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: VariationActionDto, @CurrentUser() user: JwtPayload) {
    return this.commercial.submitVariation(projectId, id, user.sub, dto.comment);
  }

  @Post('variations/:id/withdraw')
  @RequirePermission('COMMERCIAL', 'EDIT')
  withdraw(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: VariationActionDto, @CurrentUser() user: JwtPayload) {
    return this.commercial.withdrawVariation(projectId, id, user.sub, dto.comment);
  }

  // APPROVE in the matrix, and the service also insists the caller is the
  // project's client (Meeting 3 hard rule).
  @Post('variations/:id/decide')
  @RequirePermission('COMMERCIAL', 'APPROVE')
  decide(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DecideVariationDto, @CurrentUser() user: JwtPayload) {
    return this.commercial.decideVariation(projectId, id, user.sub, dto);
  }

  @Delete('variations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('COMMERCIAL', 'DELETE')
  removeVariation(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.commercial.removeVariation(projectId, id);
  }

  // ---- Supplier invoices

  @Get('invoices')
  @RequirePermission('COMMERCIAL', 'VIEW')
  invoices(@Param('projectId') projectId: string) {
    return this.commercial.listInvoices(projectId);
  }

  @Post('invoices')
  @RequirePermission('COMMERCIAL', 'CREATE')
  createInvoice(@Param('projectId') projectId: string, @Body() dto: CreateInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.commercial.createInvoice(projectId, user.sub, dto);
  }

  @Patch('invoices/:id')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updateInvoice(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.commercial.updateInvoice(projectId, id, dto);
  }

  // Setjeka's internal check on a supplier's invoice - not a client
  // approval, so EDIT rather than APPROVE.
  @Post('invoices/:id/approve')
  @RequirePermission('COMMERCIAL', 'EDIT')
  approveInvoice(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.commercial.approveInvoice(projectId, id, user.sub);
  }

  @Post('invoices/:id/pay')
  @RequirePermission('COMMERCIAL', 'EDIT')
  payInvoice(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PayInvoiceDto) {
    return this.commercial.payInvoice(projectId, id, dto);
  }

  @Post('invoices/:id/reject')
  @RequirePermission('COMMERCIAL', 'EDIT')
  rejectInvoice(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RejectInvoiceDto) {
    return this.commercial.rejectInvoice(projectId, id, dto);
  }

  @Delete('invoices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('COMMERCIAL', 'DELETE')
  removeInvoice(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.commercial.removeInvoice(projectId, id);
  }
}
