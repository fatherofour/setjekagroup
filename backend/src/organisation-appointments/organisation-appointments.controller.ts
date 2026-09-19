import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrganisationAppointmentsService } from './organisation-appointments.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { UpdateAppointmentDto } from './dto/update-appointment.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('contractors/:contractorId/appointments')
@UseGuards(JwtAccessGuard)
export class OrganisationAppointmentsController {
  constructor(private readonly appointmentsService: OrganisationAppointmentsService) {}

  @Get()
  findAll(@Param('contractorId') contractorId: string) {
    return this.appointmentsService.findAll(contractorId);
  }

  @Post()
  create(@Param('contractorId') contractorId: string, @Body() dto: CreateAppointmentDto, @CurrentUser() user: JwtPayload) {
    return this.appointmentsService.create(contractorId, user.sub, dto);
  }

  @Patch(':id')
  update(@Param('contractorId') contractorId: string, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(contractorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('contractorId') contractorId: string, @Param('id') id: string) {
    return this.appointmentsService.remove(contractorId, id);
  }
}
