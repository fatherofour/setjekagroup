import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PortfolioService } from './portfolio.service.js';

// Across projects, so there is no project permission to check: the service
// lets Setjeka staff in and no one else.
@Controller('portfolio')
@UseGuards(JwtAccessGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.portfolio.portfolio(user.sub);
  }
}
