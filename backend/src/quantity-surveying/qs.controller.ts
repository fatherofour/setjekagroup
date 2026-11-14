import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { requestMeta } from '../signoff/signoff.controller.js';
import { DecisionDto } from '../signoff/dto/decision.dto.js';
import { CostPlansService } from './cost-plans.service.js';
import { ContractsService } from './contracts.service.js';
import { ValuationsService } from './valuations.service.js';
import {
  CashFlowDto,
  CertifyValuationDto,
  ContractFromAwardDto,
  CreateContractDto,
  CreateCostPlanDto,
  CreateTenderDto,
  CreateValuationDto,
  FinalAccountActionDto,
  ImportBoqDto,
  IssueCostPlanDto,
  PayValuationDto,
  ReturnValuationDto,
  SaveItemsDto,
  UpdateContractDto,
  UpdateCostPlanDto,
  UpdateValuationDto,
} from './dto/qs.dto.js';

const download = (res: Response, bytes: Uint8Array | Buffer, filename: string, type: string) => {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w .()-]/g, '_')}"`);
  res.send(Buffer.from(bytes));
};

/** The quantity surveyor's work on a project (PROCSA QS Stages 2 to 6):
 * bills and cost plans, contracts and their final accounts, and payment
 * valuations through to the certificate. The matrix gates the module; the
 * services hold the finer rules (who prepares, who accepts and issues, and
 * the client alone approving payment). */
@Controller('projects/:projectId/qs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class QsController {
  constructor(
    private readonly plans: CostPlansService,
    private readonly contracts: ContractsService,
    private readonly valuations: ValuationsService,
  ) {}

  // ---- Bills and cost plans

  @Get('cost-plans')
  @RequirePermission('COMMERCIAL', 'VIEW')
  listPlans(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.plans.list(projectId, user.sub);
  }

  @Post('cost-plans')
  @RequirePermission('COMMERCIAL', 'CREATE')
  createPlan(@Param('projectId') projectId: string, @Body() dto: CreateCostPlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.create(projectId, user.sub, dto);
  }

  @Get('cost-plans/:id')
  @RequirePermission('COMMERCIAL', 'VIEW')
  getPlan(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plans.get(projectId, user.sub, id);
  }

  @Patch('cost-plans/:id')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updatePlan(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateCostPlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.update(projectId, user.sub, id, dto);
  }

  @Delete('cost-plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('COMMERCIAL', 'DELETE')
  removePlan(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plans.remove(projectId, user.sub, id);
  }

  @Put('cost-plans/:id/items')
  @RequirePermission('COMMERCIAL', 'EDIT')
  saveItems(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SaveItemsDto, @CurrentUser() user: JwtPayload) {
    return this.plans.saveItems(projectId, user.sub, id, dto.items);
  }

  @Post('cost-plans/:id/import')
  @RequirePermission('COMMERCIAL', 'EDIT')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  importPlan(@Param('projectId') projectId: string, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: ImportBoqDto, @CurrentUser() user: JwtPayload) {
    return this.plans.importFile(projectId, user.sub, id, file, dto.mode);
  }

  @Get('cost-plans/:id/export')
  @RequirePermission('COMMERCIAL', 'VIEW')
  async exportPlan(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { buffer, filename } = await this.plans.exportXlsx(projectId, user.sub, id);
    download(res, buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  @Post('cost-plans/:id/issue')
  @RequirePermission('COMMERCIAL', 'EDIT')
  issuePlan(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: IssueCostPlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.issue(projectId, user.sub, id, dto.reason);
  }

  @Post('cost-plans/:id/accept')
  @RequirePermission('COMMERCIAL', 'EDIT')
  acceptPlan(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plans.accept(projectId, user.sub, id);
  }

  @Post('cost-plans/:id/adopt-budget')
  @RequirePermission('COMMERCIAL', 'EDIT')
  adoptPlan(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plans.adoptAsBudget(projectId, user.sub, id);
  }

  @Get('cost-plans/:id/revisions/:revision')
  @RequirePermission('COMMERCIAL', 'VIEW')
  planRevision(@Param('projectId') projectId: string, @Param('id') id: string, @Param('revision', ParseIntPipe) revision: number, @CurrentUser() user: JwtPayload) {
    return this.plans.revision(projectId, user.sub, id, revision);
  }

  @Get('cost-plans/:id/compare')
  @RequirePermission('COMMERCIAL', 'VIEW')
  comparePlan(@Param('projectId') projectId: string, @Param('id') id: string, @Query('from', ParseIntPipe) from: number, @Query('to') to: string, @CurrentUser() user: JwtPayload) {
    return this.plans.compare(projectId, user.sub, id, from, to === 'current' || !to ? 'current' : Number.parseInt(to, 10));
  }

  // The QS prepares the tender from their bill (QS 4.5); Setjeka invites the
  // tenderers, issues and awards it under Procurement. So it's a Commercial
  // right (Setjeka and the QS), not a buying one, which only Setjeka holds.
  @Post('cost-plans/:id/tender')
  @RequirePermission('COMMERCIAL', 'CREATE')
  tender(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CreateTenderDto, @CurrentUser() user: JwtPayload) {
    return this.plans.createTender(projectId, user.sub, id, dto);
  }

  @Get('cost-plans/:id/tenders')
  @RequirePermission('PROCUREMENT', 'VIEW')
  tenders(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plans.tenders(projectId, user.sub, id);
  }

  // ---- Contracts and final accounts

  @Get('contracts')
  @RequirePermission('COMMERCIAL', 'VIEW')
  listContracts(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.contracts.list(projectId, user.sub);
  }

  @Post('contracts')
  @RequirePermission('COMMERCIAL', 'CREATE')
  createContract(@Param('projectId') projectId: string, @Body() dto: CreateContractDto, @CurrentUser() user: JwtPayload) {
    return this.contracts.create(projectId, user.sub, dto);
  }

  @Post('contracts/from-award')
  @RequirePermission('COMMERCIAL', 'CREATE')
  contractFromAward(@Param('projectId') projectId: string, @Body() dto: ContractFromAwardDto, @CurrentUser() user: JwtPayload) {
    return this.contracts.fromAward(projectId, user.sub, dto);
  }

  @Get('contracts/:id')
  @RequirePermission('COMMERCIAL', 'VIEW')
  getContract(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contracts.get(projectId, user.sub, id);
  }

  @Patch('contracts/:id')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updateContract(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentUser() user: JwtPayload) {
    return this.contracts.update(projectId, user.sub, id, dto);
  }

  @Delete('contracts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('COMMERCIAL', 'DELETE')
  removeContract(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contracts.remove(projectId, user.sub, id);
  }

  @Get('contracts/:id/final-account')
  @RequirePermission('COMMERCIAL', 'VIEW')
  finalAccount(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contracts.finalAccount(projectId, user.sub, id);
  }

  @Post('contracts/:id/final-account')
  @RequirePermission('COMMERCIAL', 'EDIT')
  finalAccountAction(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: FinalAccountActionDto, @CurrentUser() user: JwtPayload) {
    return this.contracts.finalAccountAction(projectId, user.sub, id, dto);
  }

  @Post('contracts/:id/cash-flow')
  @RequirePermission('COMMERCIAL', 'EDIT')
  cashFlow(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CashFlowDto, @CurrentUser() user: JwtPayload) {
    return this.contracts.cashFlow(projectId, user.sub, id, dto);
  }

  // ---- Valuations and payment certificates

  @Get('valuations')
  @RequirePermission('COMMERCIAL', 'VIEW')
  listValuations(@Param('projectId') projectId: string, @Query('contractId') contractId: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.valuations.list(projectId, user.sub, contractId || undefined);
  }

  @Post('valuations')
  @RequirePermission('COMMERCIAL', 'CREATE')
  createValuation(@Param('projectId') projectId: string, @Body() dto: CreateValuationDto, @CurrentUser() user: JwtPayload) {
    return this.valuations.create(projectId, user.sub, dto);
  }

  @Get('valuations/:id')
  @RequirePermission('COMMERCIAL', 'VIEW')
  getValuation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.valuations.get(projectId, user.sub, id);
  }

  @Get('valuations/:id/pdf')
  @RequirePermission('COMMERCIAL', 'VIEW')
  async valuationPdf(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { bytes, filename } = await this.valuations.pdf(projectId, user.sub, id);
    download(res, bytes, filename, 'application/pdf');
  }

  @Patch('valuations/:id')
  @RequirePermission('COMMERCIAL', 'EDIT')
  updateValuation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateValuationDto, @CurrentUser() user: JwtPayload) {
    return this.valuations.update(projectId, user.sub, id, dto);
  }

  @Post('valuations/:id/refresh')
  @RequirePermission('COMMERCIAL', 'EDIT')
  refreshValuation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.valuations.refresh(projectId, user.sub, id);
  }

  @Post('valuations/:id/submit')
  @RequirePermission('COMMERCIAL', 'EDIT')
  submitValuation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.valuations.submit(projectId, user.sub, id);
  }

  @Post('valuations/:id/return')
  @RequirePermission('COMMERCIAL', 'EDIT')
  returnValuation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ReturnValuationDto, @CurrentUser() user: JwtPayload) {
    return this.valuations.returnToQs(projectId, user.sub, id, dto.reason);
  }

  @Post('valuations/:id/certify')
  @RequirePermission('COMMERCIAL', 'EDIT')
  certifyValuation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CertifyValuationDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.valuations.certify(projectId, user.sub, id, dto, requestMeta(req));
  }

  // APPROVE in the matrix, and the service also insists on the client.
  @Post('valuations/:id/decide')
  @RequirePermission('COMMERCIAL', 'APPROVE')
  decideValuation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.valuations.decide(projectId, user.sub, id, dto, requestMeta(req));
  }

  @Post('valuations/:id/pay')
  @RequirePermission('COMMERCIAL', 'EDIT')
  payValuation(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PayValuationDto, @CurrentUser() user: JwtPayload) {
    return this.valuations.pay(projectId, user.sub, id, dto);
  }

  @Post('valuations/:id/reopen')
  @RequirePermission('COMMERCIAL', 'EDIT')
  reopenValuation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.valuations.reopen(projectId, user.sub, id);
  }

  @Delete('valuations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('COMMERCIAL', 'DELETE')
  removeValuation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.valuations.remove(projectId, user.sub, id);
  }
}
