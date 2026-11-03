import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { TimeClaimsService } from './time-claims.service.js';
import { AssessClaimDto, ClaimReasonDto, NotifyDelayDto, PenaltyDto, RespondClaimDto, SubmitClaimDto } from './dto/time-claims.dto.js';

// Delay notices are formal correspondence, so they sit with instructions
// and letters in the permission matrix: contractors and the client can
// read and write there. The service decides who notifies, claims and
// assesses, and what the client sees.
@Controller('projects/:projectId/time-claims')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class TimeClaimsController {
  constructor(private readonly claims: TimeClaimsService) {}

  @Get('contracts')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  contracts(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.claims.contracts(projectId, user.sub);
  }

  @Put('contracts/:contractId/penalty')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  setPenalty(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Body() dto: PenaltyDto, @CurrentUser() user: JwtPayload) {
    return this.claims.setPenalty(projectId, user.sub, contractId, dto.penaltyPerDay);
  }

  @Get()
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.claims.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.claims.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  notify(@Param('projectId') projectId: string, @Body() dto: NotifyDelayDto, @CurrentUser() user: JwtPayload) {
    return this.claims.notify(projectId, user.sub, dto);
  }

  @Post(':id/submit')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  submit(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SubmitClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.submit(projectId, user.sub, id, dto);
  }

  @Post(':id/assess')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  assess(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: AssessClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.assess(projectId, user.sub, id, dto);
  }

  @Post(':id/respond')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  respond(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: RespondClaimDto, @CurrentUser() user: JwtPayload) {
    return this.claims.respond(projectId, user.sub, id, dto);
  }

  @Post(':id/withdraw')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  withdraw(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ClaimReasonDto, @CurrentUser() user: JwtPayload) {
    return this.claims.withdraw(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/variation')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  raiseVariation(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.claims.raiseVariation(projectId, user.sub, id);
  }
}
