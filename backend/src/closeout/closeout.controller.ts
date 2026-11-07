import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { requestMeta } from '../signoff/signoff.controller.js';
import { DecisionDto } from '../signoff/dto/decision.dto.js';
import { CloseoutService } from './closeout.service.js';

class IssueCertificateDto {
  @IsDateString() completionDate!: string;
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
  @IsOptional() @IsDateString() responseDueAt?: string;
}

class CompleteDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class AbandonDto {
  @IsString() @MinLength(10) @MaxLength(4000) reason!: string;
}

/** Close-out: the certificate of completion, completing, abandoning. */
@Controller('projects/:projectId/closeout')
@UseGuards(JwtAccessGuard)
export class CloseoutController {
  constructor(private readonly closeout: CloseoutService) {}

  @Get()
  state(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.closeout.state(projectId, user.sub);
  }

  @Post('completion-certificate')
  issue(@Param('projectId') projectId: string, @Body() dto: IssueCertificateDto, @CurrentUser() user: JwtPayload) {
    return this.closeout.issueCertificate(projectId, user.sub, dto);
  }

  @Post('completion-certificate/:id/withdraw')
  withdraw(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.closeout.withdrawCertificate(projectId, user.sub, id);
  }

  @Post('completion-certificate/:id/decide')
  decide(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.closeout.decideCertificate(projectId, user.sub, id, dto, requestMeta(req));
  }

  @Post('complete')
  complete(@Param('projectId') projectId: string, @Body() dto: CompleteDto, @CurrentUser() user: JwtPayload) {
    return this.closeout.complete(projectId, user.sub, dto.reason);
  }

  @Post('abandon')
  abandon(@Param('projectId') projectId: string, @Body() dto: AbandonDto, @CurrentUser() user: JwtPayload) {
    return this.closeout.abandon(projectId, user.sub, dto.reason);
  }
}
