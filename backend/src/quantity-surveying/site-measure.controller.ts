import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { SiteMeasureService } from './site-measure.service.js';
import { CreateDayworkDto, CreateMeasurementDto, MeasureReasonDto } from './dto/qs.dto.js';

// Contractors and engineers have no Commercial permission, so the service
// decides access contract by contract: Setjeka, the QS and the contract's
// engineer measure and sign; the contract's contractor agrees and submits.
@Controller('projects/:projectId/qs')
@UseGuards(JwtAccessGuard)
export class SiteMeasureController {
  constructor(private readonly measure: SiteMeasureService) {}

  @Get('site-contracts')
  contracts(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.measure.contracts(projectId, user.sub);
  }

  @Get('contracts/:contractId/measurements')
  measurements(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @CurrentUser() user: JwtPayload) {
    return this.measure.measurements(projectId, user.sub, contractId);
  }

  @Post('contracts/:contractId/measurements')
  record(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Body() dto: CreateMeasurementDto, @CurrentUser() user: JwtPayload) {
    return this.measure.record(projectId, user.sub, contractId, dto);
  }

  @Post('contracts/:contractId/measurements/:id/agree')
  agree(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.measure.respond(projectId, user.sub, contractId, id, true);
  }

  @Post('contracts/:contractId/measurements/:id/dispute')
  dispute(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Param('id') id: string, @Body() dto: MeasureReasonDto, @CurrentUser() user: JwtPayload) {
    return this.measure.respond(projectId, user.sub, contractId, id, false, dto.reason);
  }

  @Delete('contracts/:contractId/measurements/:id')
  remove(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.measure.removeMeasurement(projectId, user.sub, contractId, id);
  }

  @Get('contracts/:contractId/dayworks')
  dayworks(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @CurrentUser() user: JwtPayload) {
    return this.measure.dayworks(projectId, user.sub, contractId);
  }

  @Post('contracts/:contractId/dayworks')
  submit(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Body() dto: CreateDayworkDto, @CurrentUser() user: JwtPayload) {
    return this.measure.submitDaywork(projectId, user.sub, contractId, dto);
  }

  @Post('contracts/:contractId/dayworks/:id/sign')
  sign(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Param('id') id: string, @Body() dto: MeasureReasonDto, @CurrentUser() user: JwtPayload) {
    return this.measure.decideDaywork(projectId, user.sub, contractId, id, true, dto.reason);
  }

  @Post('contracts/:contractId/dayworks/:id/reject')
  reject(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Param('id') id: string, @Body() dto: MeasureReasonDto, @CurrentUser() user: JwtPayload) {
    return this.measure.decideDaywork(projectId, user.sub, contractId, id, false, dto.reason);
  }
}
