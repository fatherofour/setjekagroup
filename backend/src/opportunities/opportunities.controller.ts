import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service.js';
import { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import { ChangeOpportunityStageDto } from './dto/change-stage.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('opportunities')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  findAll() {
    return this.opportunitiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOpportunityDto, @CurrentUser() user: JwtPayload) {
    return this.opportunitiesService.create(user.sub, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Patch(':id/stage')
  changeStage(@Param('id') id: string, @Body() dto: ChangeOpportunityStageDto, @CurrentUser() user: JwtPayload) {
    return this.opportunitiesService.changeStage(id, user.sub, dto);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.opportunitiesService.getHistory(id);
  }

  @Post(':id/convert-to-project')
  convertToProject(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.opportunitiesService.convertToProject(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.opportunitiesService.remove(id);
  }
}
