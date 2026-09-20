import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectRisksService } from './project-risks.service.js';
import { CreateRiskDto } from './dto/create-risk.dto.js';
import { UpdateRiskDto } from './dto/update-risk.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/risks')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectRisksController {
  constructor(private readonly risksService: ProjectRisksService) {}

  @Get()
  @RequirePermission('RISKS', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.risksService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('RISKS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateRiskDto, @CurrentUser() user: JwtPayload) {
    return this.risksService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('RISKS', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.risksService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('RISKS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.risksService.remove(projectId, user.sub, id);
  }
}
