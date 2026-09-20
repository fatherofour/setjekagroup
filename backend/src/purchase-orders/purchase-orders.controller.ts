import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import { CreatePurchaseOrderDto } from './dto/create-po.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-po.dto.js';
import { ChangePurchaseOrderStatusDto } from './dto/change-po-status.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/purchase-orders')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('PROCUREMENT', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.purchaseOrdersService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('PROCUREMENT', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: JwtPayload) {
    return this.purchaseOrdersService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROCUREMENT', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.purchaseOrdersService.update(projectId, user.sub, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('PROCUREMENT', 'APPROVE')
  changeStatus(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: ChangePurchaseOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.purchaseOrdersService.changeStatus(projectId, user.sub, id, user.sub, dto);
  }

  @Get(':id/history')
  @RequirePermission('PROCUREMENT', 'VIEW')
  getHistory(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.purchaseOrdersService.getHistory(projectId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROCUREMENT', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.purchaseOrdersService.remove(projectId, user.sub, id);
  }
}
