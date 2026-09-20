import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContractorsService } from './contractors.service.js';
import { CreateContractorDto } from './dto/create-contractor.dto.js';
import { UpdateContractorDto } from './dto/update-contractor.dto.js';
import { FindContractorsDto } from './dto/find-contractors.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('contractors')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class ContractorsController {
  constructor(private readonly contractorsService: ContractorsService) {}

  @Get()
  findAll(@Query() filters: FindContractorsDto) {
    return this.contractorsService.findAll(filters);
  }

  @Get('check-duplicate')
  checkDuplicate(
    @Query('name') name?: string,
    @Query('registrationNumber') registrationNumber?: string,
    @Query('taxVatNumber') taxVatNumber?: string,
  ) {
    return this.contractorsService.checkDuplicate(name, registrationNumber, taxVatNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractorsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateContractorDto, @CurrentUser() user: JwtPayload) {
    return this.contractorsService.create(user.sub, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractorDto) {
    return this.contractorsService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() user: JwtPayload) {
    return this.contractorsService.updateStatus(id, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.contractorsService.remove(id);
  }
}
