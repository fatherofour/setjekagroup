import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { UpdateQuoteDto } from './dto/update-quote.dto.js';
import { EvaluateQuoteDto } from './dto/evaluate-quote.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/rfqs/:rfqId/quotes')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  @RequirePermission('PROCUREMENT', 'VIEW')
  findAll(@Param('projectId') projectId: string, @Param('rfqId') rfqId: string, @CurrentUser() user: JwtPayload) {
    return this.quotesService.findAll(projectId, rfqId, user.sub);
  }

  @Post()
  @RequirePermission('PROCUREMENT', 'CREATE')
  create(
    @Param('projectId') projectId: string,
    @Param('rfqId') rfqId: string,
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quotesService.create(projectId, rfqId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROCUREMENT', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('rfqId') rfqId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quotesService.update(projectId, rfqId, user.sub, id, dto);
  }

  @Patch(':id/evaluate')
  @RequirePermission('PROCUREMENT', 'APPROVE')
  evaluate(
    @Param('projectId') projectId: string,
    @Param('rfqId') rfqId: string,
    @Param('id') id: string,
    @Body() dto: EvaluateQuoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quotesService.evaluate(projectId, rfqId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROCUREMENT', 'DELETE')
  remove(
    @Param('projectId') projectId: string,
    @Param('rfqId') rfqId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quotesService.remove(projectId, rfqId, user.sub, id);
  }
}
