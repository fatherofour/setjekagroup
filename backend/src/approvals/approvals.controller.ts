import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { ApprovalsService } from './approvals.service.js';

@Controller('approvals')
@UseGuards(JwtAccessGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  mine(@CurrentUser() user: JwtPayload) {
    return this.approvals.forUser(user.sub);
  }
}
