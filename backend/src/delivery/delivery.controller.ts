import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DecisionDto } from '../signoff/dto/decision.dto.js';
import { requestMeta } from '../signoff/signoff.controller.js';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { DeliveryRegistersService } from './delivery-registers.service.js';
import { ProcsaService } from './procsa.service.js';

class CheckDto {
  @IsBoolean() done!: boolean;
  @IsOptional() @IsString() note?: string;
}

/** The register definitions, for the screens. */
@Controller('delivery/registers')
@UseGuards(JwtAccessGuard)
export class RegisterDefinitionsController {
  constructor(private readonly registers: DeliveryRegistersService) {}

  @Get()
  definitions() {
    return this.registers.definitions();
  }
}

@Controller('projects/:projectId')
@UseGuards(JwtAccessGuard)
export class DeliveryController {
  constructor(
    private readonly registers: DeliveryRegistersService,
    private readonly procsa: ProcsaService,
  ) {}

  @Get('procsa')
  tracker(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.procsa.tracker(projectId, user.sub);
  }

  @Put('procsa/:stage/:roleKey/:code')
  check(@Param('projectId') projectId: string, @Param('stage') stage: string, @Param('roleKey') roleKey: string, @Param('code') code: string, @Body() dto: CheckDto, @CurrentUser() user: JwtPayload) {
    return this.procsa.setCheck(projectId, user.sub, stage, roleKey, code, dto.done, dto.note);
  }

  @Get('delivery-registers')
  summary(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.registers.summary(projectId, user.sub);
  }

  @Get('delivery-registers/:key')
  list(@Param('projectId') projectId: string, @Param('key') key: string, @CurrentUser() user: JwtPayload) {
    return this.registers.list(projectId, user.sub, key);
  }

  @Post('delivery-registers/:key')
  create(@Param('projectId') projectId: string, @Param('key') key: string, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtPayload) {
    return this.registers.create(projectId, user.sub, key, body);
  }

  @Patch('delivery-registers/:key/:id')
  update(@Param('projectId') projectId: string, @Param('key') key: string, @Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtPayload) {
    return this.registers.update(projectId, user.sub, key, id, body);
  }

  @Delete('delivery-registers/:key/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('key') key: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.registers.remove(projectId, user.sub, key, id);
  }

  /** The architect's signed review of an entry. */
  @Post('delivery-registers/:key/:id/review')
  review(@Param('projectId') projectId: string, @Param('key') key: string, @Param('id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.registers.review(projectId, user.sub, key, id, dto, requestMeta(req));
  }
}
