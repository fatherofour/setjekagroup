import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TransmittalsService } from './transmittals.service.js';
import { CreateTransmittalDto } from './dto/create-transmittal.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects/:projectId/transmittals')
@UseGuards(JwtAccessGuard)
export class TransmittalsController {
  constructor(private readonly transmittalsService: TransmittalsService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.findAll(projectId, user.sub);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateTransmittalDto, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.create(projectId, user.sub, user.sub, dto);
  }

  @Patch(':id/issue')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.issue(projectId, user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.transmittalsService.remove(projectId, user.sub, id);
  }
}
