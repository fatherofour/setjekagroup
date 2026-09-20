import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { VendorScorecardsService } from './vendor-scorecards.service.js';
import { CreateScorecardDto } from './dto/create-scorecard.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('contractors/:contractorId/scorecards')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class VendorScorecardsController {
  constructor(private readonly scorecardsService: VendorScorecardsService) {}

  @Get()
  findAll(@Param('contractorId') contractorId: string) {
    return this.scorecardsService.findAll(contractorId);
  }

  @Post()
  create(@Param('contractorId') contractorId: string, @Body() dto: CreateScorecardDto, @CurrentUser() user: JwtPayload) {
    return this.scorecardsService.create(contractorId, user.sub, dto);
  }
}
