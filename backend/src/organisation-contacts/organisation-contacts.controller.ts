import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrganisationContactsService } from './organisation-contacts.service.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { UpdateContactDto } from './dto/update-contact.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';

@Controller('contractors/:contractorId/contacts')
@UseGuards(JwtAccessGuard)
export class OrganisationContactsController {
  constructor(private readonly contactsService: OrganisationContactsService) {}

  @Get()
  findAll(@Param('contractorId') contractorId: string) {
    return this.contactsService.findAll(contractorId);
  }

  @Post()
  create(@Param('contractorId') contractorId: string, @Body() dto: CreateContactDto) {
    return this.contactsService.create(contractorId, dto);
  }

  @Patch(':id')
  update(@Param('contractorId') contractorId: string, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(contractorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('contractorId') contractorId: string, @Param('id') id: string) {
    return this.contactsService.remove(contractorId, id);
  }
}
