import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { ApprovalSubject, SignatureMethod } from '../generated/prisma/enums.js';
import { SignoffService, type RequestMeta } from './signoff.service.js';
import { DocumentApprovalsService } from './document-approvals.service.js';
import { DecisionDto } from './dto/decision.dto.js';

class SaveSignatureDto {
  @IsEnum(SignatureMethod) method!: SignatureMethod;
  @IsString() @MaxLength(1_500_000) image!: string;
}

class RequestDocumentApprovalDto {
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsDateString() responseDueAt?: string;
}

export function requestMeta(req: Request): RequestMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() || req.ip;
  return { ip, userAgent: req.headers['user-agent'] };
}

/** A person's own saved signature. */
@Controller('me/signature')
@UseGuards(JwtAccessGuard)
export class MySignatureController {
  constructor(private readonly signoff: SignoffService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.signoff.mySignature(user.sub);
  }

  @Put()
  save(@CurrentUser() user: JwtPayload, @Body() dto: SaveSignatureDto) {
    return this.signoff.saveMySignature(user.sub, dto.method, dto.image);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload) {
    return this.signoff.deleteMySignature(user.sub);
  }

  @Get('image')
  async image(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const path = await this.signoff.mySignatureFile(user.sub);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(path).pipe(res);
  }
}

/** Sign-off records and their signed documents for a project. */
@Controller('projects/:projectId/approval-records')
@UseGuards(JwtAccessGuard)
export class ApprovalRecordsController {
  constructor(private readonly signoff: SignoffService) {}

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @Query('subject') subject?: ApprovalSubject, @Query('subjectId') subjectId?: string) {
    return this.signoff.list(projectId, user.sub, subject && Object.values(ApprovalSubject).includes(subject) ? subject : undefined, subjectId);
  }

  @Get(':id/signed')
  async signed(@Param('projectId') projectId: string, @Param('id') id: string, @Query('download') download: string | undefined, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const f = await this.signoff.signedFile(projectId, user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(f.filename)}"`);
    createReadStream(f.path).pipe(res);
  }
}

/** Documents sent to the client for approval. */
@Controller('projects/:projectId')
@UseGuards(JwtAccessGuard)
export class DocumentApprovalsController {
  constructor(private readonly approvals: DocumentApprovalsService) {}

  @Get('document-approvals')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @Query('revisionId') revisionId?: string) {
    return this.approvals.list(projectId, user.sub, revisionId);
  }

  @Post('documents/:documentId/revisions/:revisionId/client-approval')
  request(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: RequestDocumentApprovalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvals.request(projectId, user.sub, documentId, revisionId, dto);
  }

  @Post('document-approvals/:id/withdraw')
  withdraw(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.approvals.withdraw(projectId, user.sub, id);
  }

  @Post('document-approvals/:id/decide')
  decide(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.approvals.decide(projectId, user.sub, id, dto, requestMeta(req));
  }
}
