import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { CostDatabaseService } from './cost-database.service.js';
import {
  CreateCostCodeDto,
  CreateFxRateDto,
  CreateRegionDto,
  CreateResourceDto,
  CreateWorkItemDto,
  PriceSheetDto,
  SetPriceDto,
  UpdateCostCodeDto,
  UpdateRegionDto,
  UpdateResourceDto,
  UpdateWorkItemDto,
} from './dto/cost-database.dto.js';

// Setjeka's own pricing data - company-wide, so internal staff only.

@Controller('cost-regions')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class CostRegionsController {
  constructor(private readonly costs: CostDatabaseService) {}

  @Get()
  list() {
    return this.costs.listRegions();
  }

  @Post()
  create(@Body() dto: CreateRegionDto) {
    return this.costs.createRegion(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.costs.updateRegion(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.costs.deleteRegion(id);
  }

  @Put(':id/prices')
  savePriceSheet(@Param('id') id: string, @Body() dto: PriceSheetDto, @CurrentUser() user: JwtPayload) {
    return this.costs.savePriceSheet(id, user.sub, dto);
  }
}

@Controller('cost-resources')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class CostResourcesController {
  constructor(private readonly costs: CostDatabaseService) {}

  @Get()
  list(@Query('regionId') regionId?: string, @Query('all') all?: string) {
    return this.costs.listResources(regionId || undefined, all === 'true');
  }

  @Post()
  create(@Body() dto: CreateResourceDto) {
    return this.costs.createResource(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateResourceDto) {
    return this.costs.updateResource(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.costs.deleteResource(id);
  }

  @Put(':id/prices/:regionId')
  setPrice(@Param('id') id: string, @Param('regionId') regionId: string, @Body() dto: SetPriceDto, @CurrentUser() user: JwtPayload) {
    return this.costs.setPrice(id, regionId, user.sub, dto);
  }

  @Get(':id/price-history')
  history(@Param('id') id: string, @Query('regionId') regionId?: string) {
    return this.costs.priceHistory(id, regionId || undefined);
  }
}

@Controller('work-items')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class WorkItemsController {
  constructor(private readonly costs: CostDatabaseService) {}

  @Get()
  list(@Query('regionId') regionId?: string, @Query('all') all?: string) {
    return this.costs.listWorkItems(regionId || undefined, all === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('regionId') regionId?: string) {
    return this.costs.getWorkItem(id, regionId || undefined);
  }

  @Post()
  create(@Body() dto: CreateWorkItemDto) {
    return this.costs.createWorkItem(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkItemDto) {
    return this.costs.updateWorkItem(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.costs.deleteWorkItem(id);
  }
}

// Cost codes are read by project members (budget, variations, POs), so
// listing is open to any signed-in user; changing them is internal-only.
@Controller('cost-codes')
@UseGuards(JwtAccessGuard)
export class CostCodesController {
  constructor(private readonly costs: CostDatabaseService) {}

  @Get()
  list(@Query('all') all?: string) {
    return this.costs.listCostCodes(all === 'true');
  }

  @Post()
  @UseGuards(InternalOnlyGuard)
  create(@Body() dto: CreateCostCodeDto) {
    return this.costs.createCostCode(dto);
  }

  @Patch(':id')
  @UseGuards(InternalOnlyGuard)
  update(@Param('id') id: string, @Body() dto: UpdateCostCodeDto) {
    return this.costs.updateCostCode(id, dto);
  }
}

@Controller('fx-rates')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class FxRatesController {
  constructor(private readonly costs: CostDatabaseService) {}

  @Get()
  list() {
    return this.costs.listFxRates();
  }

  @Post()
  create(@Body() dto: CreateFxRateDto, @CurrentUser() user: JwtPayload) {
    return this.costs.createFxRate(user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.costs.deleteFxRate(id);
  }
}
