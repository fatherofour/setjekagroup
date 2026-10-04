import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RfqsService } from './rfqs.service.js';
import { CreateRfqDto } from './dto/create-rfq.dto.js';
import { UpdateRfqDto } from './dto/update-rfq.dto.js';
import { InviteVendorDto } from './dto/invite-vendor.dto.js';
import { AwardRfqQuoteDto, CreateRfqItemDto, UpdateRfqItemDto } from './dto/rfq-item.dto.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/rfqs')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Get()
  @RequirePermission('PROCUREMENT', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('PROCUREMENT', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateRfqDto, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROCUREMENT', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRfqDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rfqsService.update(projectId, user.sub, id, dto);
  }

  @Post(':id/invitations')
  @RequirePermission('PROCUREMENT', 'EDIT')
  invite(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: InviteVendorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rfqsService.invite(projectId, user.sub, id, dto);
  }

  @Patch(':id/issue')
  @RequirePermission('PROCUREMENT', 'APPROVE')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.issue(projectId, user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROCUREMENT', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.remove(projectId, user.sub, id);
  }

  // Items, award and price-sheet updates are Setjeka's - vendors hold
  // PROCUREMENT edit only so they can quote.
  @Post(':id/items')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROCUREMENT', 'EDIT')
  addItem(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CreateRfqItemDto) {
    return this.rfqsService.addItem(projectId, id, dto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROCUREMENT', 'EDIT')
  updateItem(@Param('projectId') projectId: string, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateRfqItemDto) {
    return this.rfqsService.updateItem(projectId, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROCUREMENT', 'EDIT')
  removeItem(@Param('projectId') projectId: string, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.rfqsService.removeItem(projectId, id, itemId);
  }

  @Post(':id/award')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROCUREMENT', 'APPROVE')
  award(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: AwardRfqQuoteDto, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.award(projectId, id, user.sub, dto.quoteId);
  }

  @Post(':id/update-prices')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROCUREMENT', 'APPROVE')
  reapplyPrices(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rfqsService.reapplyAwardedPrices(projectId, id, user.sub);
  }
}
