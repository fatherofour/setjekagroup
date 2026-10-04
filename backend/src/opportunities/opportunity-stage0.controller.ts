import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { MAX_UPLOAD_BYTES, fileFilter, generateStoredName, uploadRootDir } from '../compliance-records/upload.util.js';
import { OpportunityRegistersService } from './opportunity-registers.service.js';
import { InvestmentDecisionsService } from './investment-decisions.service.js';
import { OpportunityDocumentsService } from './opportunity-documents.service.js';
import { OpportunitiesService } from './opportunities.service.js';
import { CheckDto, DecideDto, MarkPaidDto, RequestDecisionDto, UploadDocumentDto } from './dto/stage0.dto.js';

type Payload = Record<string, unknown>;

/** PROCSA Stage 0 work on an opportunity beyond the core record: first
 * business case (0.2), market research (0.6), creditor payments (0.8),
 * evidence documents, development milestones, the Executive's investment
 * decision and the per-role sign-offs. Internal staff only; the client's
 * part (confirming the vision) is in the client portal. */
@Controller('opportunities/:opportunityId')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class OpportunityStage0Controller {
  constructor(
    private readonly registers: OpportunityRegistersService,
    private readonly decisions: InvestmentDecisionsService,
    private readonly documents: OpportunityDocumentsService,
    private readonly opportunities: OpportunitiesService,
  ) {}

  // ---- Business case (0.2) ----
  @Get('business-cases')
  listBusinessCases(@Param('opportunityId') id: string) {
    return this.registers.findAll(id, 'business-cases');
  }
  @Post('business-cases')
  createBusinessCase(@Param('opportunityId') id: string, @Body() body: Payload, @CurrentUser() u: JwtPayload) {
    return this.registers.create(id, 'business-cases', u.sub, body);
  }
  @Patch('business-cases/:rowId')
  updateBusinessCase(@Param('opportunityId') id: string, @Param('rowId') rowId: string, @Body() body: Payload) {
    return this.registers.update(id, 'business-cases', rowId, body);
  }
  @Delete('business-cases/:rowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBusinessCase(@Param('opportunityId') id: string, @Param('rowId') rowId: string) {
    return this.registers.remove(id, 'business-cases', rowId);
  }
  @Post('business-cases/:rowId/prefer')
  preferBusinessCase(@Param('opportunityId') id: string, @Param('rowId') rowId: string) {
    return this.registers.preferBusinessCase(id, rowId);
  }

  // ---- Market research (0.6) ----
  @Get('market-research')
  listResearch(@Param('opportunityId') id: string) {
    return this.registers.findAll(id, 'market-research');
  }
  @Post('market-research')
  createResearch(@Param('opportunityId') id: string, @Body() body: Payload, @CurrentUser() u: JwtPayload) {
    return this.registers.create(id, 'market-research', u.sub, body);
  }
  @Patch('market-research/:rowId')
  updateResearch(@Param('opportunityId') id: string, @Param('rowId') rowId: string, @Body() body: Payload) {
    return this.registers.update(id, 'market-research', rowId, body);
  }
  @Delete('market-research/:rowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeResearch(@Param('opportunityId') id: string, @Param('rowId') rowId: string) {
    return this.registers.remove(id, 'market-research', rowId);
  }

  // ---- Creditor payments (0.8) ----
  @Get('payments')
  listPayments(@Param('opportunityId') id: string) {
    return this.registers.findAll(id, 'payments');
  }
  @Post('payments')
  createPayment(@Param('opportunityId') id: string, @Body() body: Payload, @CurrentUser() u: JwtPayload) {
    return this.registers.create(id, 'payments', u.sub, body);
  }
  @Patch('payments/:rowId')
  updatePayment(@Param('opportunityId') id: string, @Param('rowId') rowId: string, @Body() body: Payload) {
    return this.registers.update(id, 'payments', rowId, body);
  }
  @Delete('payments/:rowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePayment(@Param('opportunityId') id: string, @Param('rowId') rowId: string) {
    return this.registers.remove(id, 'payments', rowId);
  }
  @Post('payments/:rowId/decide')
  decidePayment(@Param('opportunityId') id: string, @Param('rowId') rowId: string, @Body() dto: DecideDto, @CurrentUser() u: JwtPayload) {
    return this.registers.decidePayment(id, rowId, u.sub, dto.approve, dto.comment);
  }
  @Post('payments/:rowId/paid')
  markPaid(@Param('opportunityId') id: string, @Param('rowId') rowId: string, @Body() dto: MarkPaidDto) {
    return this.registers.markPaid(id, rowId, dto.paymentReference, dto.paidAt);
  }

  // ---- Development milestones (register DEV R12) ----
  @Get('milestones')
  listMilestones(@Param('opportunityId') id: string) {
    return this.registers.findAll(id, 'milestones');
  }
  @Post('milestones')
  createMilestone(@Param('opportunityId') id: string, @Body() body: Payload, @CurrentUser() u: JwtPayload) {
    return this.registers.create(id, 'milestones', u.sub, body);
  }
  @Post('milestones/template')
  milestoneTemplate(@Param('opportunityId') id: string) {
    return this.registers.addMilestoneTemplate(id);
  }
  @Post('milestones/baseline')
  baselineMilestones(@Param('opportunityId') id: string) {
    return this.registers.baselineMilestones(id);
  }
  @Patch('milestones/:rowId')
  updateMilestone(@Param('opportunityId') id: string, @Param('rowId') rowId: string, @Body() body: Payload) {
    return this.registers.update(id, 'milestones', rowId, body);
  }
  @Delete('milestones/:rowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMilestone(@Param('opportunityId') id: string, @Param('rowId') rowId: string) {
    return this.registers.remove(id, 'milestones', rowId);
  }

  // ---- Investment decision (register Executive) ----
  @Get('decisions')
  listDecisions(@Param('opportunityId') id: string) {
    return this.decisions.findAll(id);
  }
  @Post('decisions')
  requestDecision(@Param('opportunityId') id: string, @Body() dto: RequestDecisionDto, @CurrentUser() u: JwtPayload) {
    return this.decisions.request(id, u.sub, dto.comment);
  }
  @Post('decisions/:decisionId/decide')
  decide(@Param('opportunityId') id: string, @Param('decisionId') decisionId: string, @Body() dto: DecideDto, @CurrentUser() u: JwtPayload) {
    return this.decisions.decide(id, decisionId, u.sub, dto.approve, dto.comment);
  }

  // ---- Per-role sign-offs (stage0.ts) ----
  @Put('checks/:roleKey/:code')
  check(@Param('opportunityId') id: string, @Param('roleKey') roleKey: string, @Param('code') code: string, @Body() dto: CheckDto, @CurrentUser() u: JwtPayload) {
    return this.opportunities.setCheck(id, u.sub, roleKey, code, true, dto.note);
  }
  @Delete('checks/:roleKey/:code')
  uncheck(@Param('opportunityId') id: string, @Param('roleKey') roleKey: string, @Param('code') code: string, @CurrentUser() u: JwtPayload) {
    return this.opportunities.setCheck(id, u.sub, roleKey, code, false);
  }

  // ---- Evidence documents ----
  @Get('documents')
  listDocuments(@Param('opportunityId') id: string) {
    return this.documents.findAll(id);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadRootDir()),
        filename: (_req, file, cb) => cb(null, generateStoredName(file.originalname)),
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter,
    }),
  )
  upload(@Param('opportunityId') id: string, @Body() dto: UploadDocumentDto, @CurrentUser() u: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.documents.upload(id, u.sub, file, dto.title, dto.linkType, dto.linkId);
  }

  @Get('documents/:docId/file')
  async download(@Param('opportunityId') id: string, @Param('docId') docId: string, @Res() res: Response) {
    const doc = await this.documents.findOne(id, docId);
    const path = join(uploadRootDir(), doc.storedName);
    if (!existsSync(path)) throw new NotFoundException('Stored file is missing');
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalFilename)}"`);
    createReadStream(path).pipe(res);
  }

  @Delete('documents/:docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDocument(@Param('opportunityId') id: string, @Param('docId') docId: string) {
    return this.documents.remove(id, docId);
  }
}
