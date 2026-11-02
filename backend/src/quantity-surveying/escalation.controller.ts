import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { EscalationService } from './escalation.service.js';
import { ValuationsService } from './valuations.service.js';
import { ContractEscalationDto, IndexValuesDto, PriceIndexDto } from './dto/qs.dto.js';

/** Contract price adjustment: the price indices, and each contract's
 * weightings on them. */
@Controller('projects/:projectId/qs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class EscalationController {
  constructor(
    private readonly escalation: EscalationService,
    private readonly valuations: ValuationsService,
  ) {}

  @Get('price-indices')
  @RequirePermission('COMMERCIAL', 'VIEW')
  indices(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.escalation.indices(projectId, user.sub);
  }

  @Post('price-indices')
  @RequirePermission('COMMERCIAL', 'EDIT')
  createIndex(@Param('projectId') projectId: string, @Body() dto: PriceIndexDto, @CurrentUser() user: JwtPayload) {
    return this.escalation.createIndex(projectId, user.sub, dto);
  }

  @Put('price-indices/:id/values')
  @RequirePermission('COMMERCIAL', 'EDIT')
  async setValues(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: IndexValuesDto, @CurrentUser() user: JwtPayload) {
    const r = await this.escalation.setValues(projectId, user.sub, id, dto);
    // A newly published index changes the adjustment on every draft
    // valuation that uses it, on any project.
    await this.valuations.recomputeDrafts({ indexId: id });
    return r;
  }

  @Get('contracts/:id/escalation')
  @RequirePermission('COMMERCIAL', 'VIEW')
  config(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.escalation.config(projectId, user.sub, id);
  }

  @Put('contracts/:id/escalation')
  @RequirePermission('COMMERCIAL', 'EDIT')
  async setContract(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ContractEscalationDto, @CurrentUser() user: JwtPayload) {
    const r = await this.escalation.setContract(projectId, user.sub, id, dto);
    await this.valuations.recomputeDrafts({ contractId: id });
    return r;
  }
}
