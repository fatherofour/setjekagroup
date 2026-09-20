import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RfisService } from './rfis.service.js';
import { CreateRfiDto } from './dto/create-rfi.dto.js';
import { UpdateRfiDto } from './dto/update-rfi.dto.js';
import { RespondRfiDto } from './dto/respond-rfi.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/rfis')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class RfisController {
  constructor(private readonly rfisService: RfisService) {}

  @Get()
  @RequirePermission('RFIS', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.rfisService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('RFIS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateRfiDto, @CurrentUser() user: JwtPayload) {
    return this.rfisService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('RFIS', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRfiDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rfisService.update(projectId, user.sub, id, dto);
  }

  @Patch(':id/respond')
  @RequirePermission('RFIS', 'APPROVE')
  respond(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RespondRfiDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rfisService.respond(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('RFIS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rfisService.remove(projectId, user.sub, id);
  }
}
