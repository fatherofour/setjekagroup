import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TransmittalsService } from './transmittals.service.js';
import { CreateTransmittalDto } from './dto/create-transmittal.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/transmittals')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class TransmittalsController {
  constructor(private readonly transmittalsService: TransmittalsService) {}

  @Get()
  @RequirePermission('TRANSMITTALS', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('TRANSMITTALS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateTransmittalDto, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.create(projectId, user.sub, user.sub, dto);
  }

  @Patch(':id/issue')
  @RequirePermission('TRANSMITTALS', 'CREATE')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.issue(projectId, user.sub, id);
  }

  /** The transmittal slip, on Setjeka's letterhead. */
  @Get(':id/pdf')
  @RequirePermission('TRANSMITTALS', 'VIEW')
  async pdf(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { bytes, filename } = await this.transmittalsService.pdf(projectId, user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(bytes);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('TRANSMITTALS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.remove(projectId, user.sub, id);
  }
}
