import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StageTransitionsService } from './stage-transitions.service.js';
import { RequestTransitionDto } from './dto/request-transition.dto.js';
import { DecideTransitionDto } from './dto/decide-transition.dto.js';
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
  ) {
    return this.stageTransitionsService.decide(projectId, user.sub, id, dto);
  }
}
