import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PortalViewsService } from './portal-views.service.js';
import { ClientProjectsService } from './client-projects.service.js';
import { VendorQuoteDto } from './dto/vendor-quote.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('client-portal')
@UseGuards(JwtAccessGuard)
export class ClientPortalController {
  constructor(
    private readonly views: PortalViewsService,
    private readonly projects: ClientProjectsService,
  ) {}

  @Get('projects')
  myProjects(@CurrentUser() user: JwtPayload) {
    return this.projects.projects(user.sub);
  }

  @Get('projects/:id')
  project(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.projects.project(user.sub, id);
  }

  @Get('opportunities')
  opportunities(@CurrentUser() user: JwtPayload) {
    return this.views.clientOpportunities(user.sub);
  }

  @Get('opportunities/:id')
  opportunity(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.views.clientOpportunity(user.sub, id);
  }

  @Post('opportunities/:id/confirm-vision')
  confirmVision(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.views.confirmVision(user.sub, id);
  }
}

@Controller('vendor-portal')
@UseGuards(JwtAccessGuard)
export class VendorPortalController {
  constructor(private readonly views: PortalViewsService) {}

  @Get('rfqs')
  rfqs(@CurrentUser() user: JwtPayload) {
    return this.views.vendorRfqs(user.sub);
  }

  @Post('rfqs/:rfqId/quote')
  submitQuote(@CurrentUser() user: JwtPayload, @Param('rfqId') rfqId: string, @Body() dto: VendorQuoteDto) {
    return this.views.submitQuote(user.sub, rfqId, dto);
  }

  @Post('rfqs/:rfqId/quote/withdraw')
  withdrawQuote(@CurrentUser() user: JwtPayload, @Param('rfqId') rfqId: string) {
    return this.views.withdrawQuote(user.sub, rfqId);
  }
}
