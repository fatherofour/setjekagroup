import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { requestMeta } from '../signoff/signoff.controller.js';
import { StageTransitionsService } from './stage-transitions.service.js';
import { RequestTransitionDto } from './dto/request-transition.dto.js';
import { AdvanceTransitionDto, DecideTransitionDto } from './dto/decide-transition.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/stage-transitions')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class StageTransitionsController {
  constructor(private readonly stageTransitionsService: StageTransitionsService) {}

  @Get()
  @RequirePermission('STAGE_GATE', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.stageTransitionsService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('STAGE_GATE', 'CREATE')
  request(@Param('projectId') projectId: string, @Body() dto: RequestTransitionDto, @CurrentUser() user: JwtPayload) {
    return this.stageTransitionsService.requestTransition(projectId, user.sub, dto);
  }

  @Patch(':id/decide')
  @RequirePermission('STAGE_GATE', 'APPROVE')
  decide(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: DecideTransitionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.stageTransitionsService.decide(projectId, user.sub, id, dto, requestMeta(req));
  }

  /** Setjeka advances without waiting for the client's sign-off, giving a
   * reason; the client is still asked to sign. */
  @Patch(':id/advance')
  @RequirePermission('STAGE_GATE', 'CREATE')
  advance(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: AdvanceTransitionDto, @CurrentUser() user: JwtPayload) {
    return this.stageTransitionsService.advance(projectId, user.sub, id, dto.reason);
  }
}
