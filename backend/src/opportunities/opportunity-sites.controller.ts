import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpportunitySitesService } from './opportunity-sites.service.js';
import { CreateOpportunitySiteDto, UpdateOpportunitySiteDto } from './dto/opportunity-site.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';

@Controller('opportunities/:opportunityId/sites')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class OpportunitySitesController {
  constructor(private readonly sites: OpportunitySitesService) {}

  @Get()
  findAll(@Param('opportunityId') opportunityId: string) {
    return this.sites.findAll(opportunityId);
  }

  @Post()
  create(@Param('opportunityId') opportunityId: string, @Body() dto: CreateOpportunitySiteDto) {
    return this.sites.create(opportunityId, dto);
  }

  @Patch(':siteId')
  update(@Param('opportunityId') opportunityId: string, @Param('siteId') siteId: string, @Body() dto: UpdateOpportunitySiteDto) {
    return this.sites.update(opportunityId, siteId, dto);
  }

  @Post(':siteId/select')
  select(@Param('opportunityId') opportunityId: string, @Param('siteId') siteId: string) {
    return this.sites.select(opportunityId, siteId);
  }

  @Delete(':siteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('opportunityId') opportunityId: string, @Param('siteId') siteId: string) {
    return this.sites.remove(opportunityId, siteId);
  }
}
