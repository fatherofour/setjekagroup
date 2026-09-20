import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SubmittalsService } from './submittals.service.js';
import { CreateSubmittalDto } from './dto/create-submittal.dto.js';
import { UpdateSubmittalDto } from './dto/update-submittal.dto.js';
import { ChangeSubmittalStatusDto } from './dto/change-status.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects/:projectId/submittals')
@UseGuards(JwtAccessGuard)
export class SubmittalsController {
  constructor(private readonly submittalsService: SubmittalsService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.submittalsService.findAll(projectId, user.sub);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateSubmittalDto, @CurrentUser() user: JwtPayload) {
    return this.submittalsService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubmittalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submittalsService.update(projectId, user.sub, id, dto);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ChangeSubmittalStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.submittalsService.changeStatus(projectId, user.sub, id, user.sub, dto);
  }

  @Get(':id/history')
  getHistory(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.submittalsService.getHistory(projectId, user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.submittalsService.remove(projectId, user.sub, id);
  }
}
