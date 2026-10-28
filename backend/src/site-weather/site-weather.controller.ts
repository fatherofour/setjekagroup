import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { SiteWeatherService } from './site-weather.service.js';

/** The site's recorded weather. Anyone on the project can look it up. */
@Controller('projects/:projectId/weather')
@UseGuards(JwtAccessGuard)
export class SiteWeatherController {
  constructor(private readonly weather: SiteWeatherService) {}

  @Get()
  history(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    return this.weather.history(projectId, user.sub, from && day.test(from) ? from : undefined, to && day.test(to) ? to : undefined);
  }

  /** Record now, rather than waiting for the next run (Setjeka staff). */
  @Post('refresh')
  @UseGuards(InternalOnlyGuard)
  refresh(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.weather.refresh(projectId, user.sub);
  }
}
