import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service.js';
import { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import { UpdateDeliveryDto } from './dto/update-delivery.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/purchase-orders/:poId/deliveries')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  @RequirePermission('PROCUREMENT', 'VIEW')
  findAll(@Param('projectId') projectId: string, @Param('poId') poId: string, @CurrentUser() user: JwtPayload) {
    return this.deliveriesService.findAll(projectId, poId, user.sub);
  }

  @Post()
  @RequirePermission('PROCUREMENT', 'CREATE')
  create(
    @Param('projectId') projectId: string,
    @Param('poId') poId: string,
    @Body() dto: CreateDeliveryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.deliveriesService.create(projectId, poId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROCUREMENT', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('poId') poId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.deliveriesService.update(projectId, poId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROCUREMENT', 'DELETE')
  remove(
    @Param('projectId') projectId: string,
    @Param('poId') poId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.deliveriesService.remove(projectId, poId, user.sub, id);
  }
}
