import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectMembersService } from './project-members.service.js';
import { CreateMemberDto } from './dto/create-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/members')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(private readonly membersService: ProjectMembersService) {}

  @Get()
  @RequirePermission('TEAM', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.membersService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('TEAM', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateMemberDto, @CurrentUser() user: JwtPayload) {
    return this.membersService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('TEAM', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.membersService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('TEAM', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.membersService.remove(projectId, user.sub, id);
  }
}
