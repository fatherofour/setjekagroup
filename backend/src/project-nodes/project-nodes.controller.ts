import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectNodesService } from './project-nodes.service.js';
import { CreateNodeDto } from './dto/create-node.dto.js';
import { UpdateNodeDto } from './dto/update-node.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/nodes')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectNodesController {
  constructor(private readonly nodesService: ProjectNodesService) {}

  @Get()
  @RequirePermission('PROJECT_STRUCTURE', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.nodesService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('PROJECT_STRUCTURE', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateNodeDto, @CurrentUser() user: JwtPayload) {
    return this.nodesService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROJECT_STRUCTURE', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nodesService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROJECT_STRUCTURE', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.nodesService.remove(projectId, user.sub, id);
  }
}
