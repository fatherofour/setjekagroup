import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { PortalAccessService } from './portal-access.service.js';
import { GrantPortalAccessDto } from './dto/grant-portal-access.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';

@Controller()
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class PortalAccessController {
  constructor(private readonly portalAccess: PortalAccessService) {}

  @Get('clients/:clientId/portal-users')
  listClientUsers(@Param('clientId') clientId: string) {
    return this.portalAccess.list('client', clientId);
  }

  @Post('clients/:clientId/portal-users')
  grantClient(@Param('clientId') clientId: string, @Body() dto: GrantPortalAccessDto) {
    return this.portalAccess.grant('client', clientId, dto);
  }

  @Post('clients/:clientId/portal-users/:userId/resend-invite')
  resendClient(@Param('clientId') clientId: string, @Param('userId') userId: string) {
    return this.portalAccess.resendInvite('client', clientId, userId);
  }

  @Delete('clients/:clientId/portal-users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeClient(@Param('clientId') clientId: string, @Param('userId') userId: string) {
    return this.portalAccess.revoke('client', clientId, userId);
  }

  @Get('contractors/:contractorId/portal-users')
  listContractorUsers(@Param('contractorId') contractorId: string) {
    return this.portalAccess.list('contractor', contractorId);
  }

  @Post('contractors/:contractorId/portal-users')
  grantContractor(@Param('contractorId') contractorId: string, @Body() dto: GrantPortalAccessDto) {
    return this.portalAccess.grant('contractor', contractorId, dto);
  }

  @Post('contractors/:contractorId/portal-users/:userId/resend-invite')
  resendContractor(@Param('contractorId') contractorId: string, @Param('userId') userId: string) {
    return this.portalAccess.resendInvite('contractor', contractorId, userId);
  }

  @Delete('contractors/:contractorId/portal-users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeContractor(@Param('contractorId') contractorId: string, @Param('userId') userId: string) {
    return this.portalAccess.revoke('contractor', contractorId, userId);
  }
}
