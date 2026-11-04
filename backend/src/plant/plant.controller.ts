import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PlantService } from './plant.service.js';
import { AddPlantDto, InspectPlantDto, PlantOffSiteDto, PlantStatusDto, UpdatePlantDto } from './dto/plant.dto.js';

// The plant register sits with the site records (inspections) in the
// permission matrix: the client sees none. The service decides who keeps it.
@Controller('projects/:projectId/plant')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class PlantController {
  constructor(private readonly plant: PlantService) {}

  @Get()
  @RequirePermission('INSPECTIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.plant.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('INSPECTIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.plant.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('INSPECTIONS', 'CREATE')
  add(@Param('projectId') projectId: string, @Body() dto: AddPlantDto, @CurrentUser() user: JwtPayload) {
    return this.plant.add(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('INSPECTIONS', 'CREATE')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdatePlantDto, @CurrentUser() user: JwtPayload) {
    return this.plant.update(projectId, user.sub, id, dto);
  }

  @Post(':id/status')
  @RequirePermission('INSPECTIONS', 'CREATE')
  setStatus(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PlantStatusDto, @CurrentUser() user: JwtPayload) {
    return this.plant.setStatus(projectId, user.sub, id, dto);
  }

  @Post(':id/inspect')
  @RequirePermission('INSPECTIONS', 'CREATE')
  inspect(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: InspectPlantDto, @CurrentUser() user: JwtPayload) {
    return this.plant.inspect(projectId, user.sub, id, dto);
  }

  @Post(':id/off-site')
  @RequirePermission('INSPECTIONS', 'CREATE')
  offSite(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PlantOffSiteDto, @CurrentUser() user: JwtPayload) {
    return this.plant.offSite(projectId, user.sub, id, dto);
  }
}
