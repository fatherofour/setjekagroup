import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PaymentRecordsService } from './payment-records.service.js';
import { CreatePaymentRecordDto } from './dto/create-payment-record.dto.js';
import { UpdatePaymentRecordDto } from './dto/update-payment-record.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('contractors/:contractorId/payments')
@UseGuards(JwtAccessGuard)
export class PaymentRecordsController {
  constructor(private readonly paymentsService: PaymentRecordsService) {}

  @Get()
  findAll(@Param('contractorId') contractorId: string) {
    return this.paymentsService.findAll(contractorId);
  }

  @Post()
  create(@Param('contractorId') contractorId: string, @Body() dto: CreatePaymentRecordDto, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.create(contractorId, user.sub, dto);
  }

  @Patch(':id')
  update(@Param('contractorId') contractorId: string, @Param('id') id: string, @Body() dto: UpdatePaymentRecordDto) {
    return this.paymentsService.update(contractorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('contractorId') contractorId: string, @Param('id') id: string) {
    return this.paymentsService.remove(contractorId, id);
  }
}
