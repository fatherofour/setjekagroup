import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { FirmDealsService } from './firm-deals.service.js';

/** A contractor's or consultant's own work with Setjeka. */
@Controller()
@UseGuards(JwtAccessGuard)
export class FirmDealsController {
  constructor(private readonly deals: FirmDealsService) {}

  @Get('me/deals')
  overall(@CurrentUser() user: JwtPayload) {
    return this.deals.overall(user.sub);
  }

  @Get('projects/:projectId/my-deals')
  forProject(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.deals.forProject(projectId, user.sub);
  }
}
