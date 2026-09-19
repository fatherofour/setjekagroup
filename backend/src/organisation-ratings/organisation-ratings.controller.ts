import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrganisationRatingsService } from './organisation-ratings.service.js';
import { CreateRatingDto } from './dto/create-rating.dto.js';
import { UpdateRatingDto } from './dto/update-rating.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('contractors/:contractorId/ratings')
@UseGuards(JwtAccessGuard)
export class OrganisationRatingsController {
  constructor(private readonly ratingsService: OrganisationRatingsService) {}

  @Get()
  findAll(@Param('contractorId') contractorId: string) {
    return this.ratingsService.findAll(contractorId);
  }

  @Post()
  create(@Param('contractorId') contractorId: string, @Body() dto: CreateRatingDto, @CurrentUser() user: JwtPayload) {
    return this.ratingsService.create(contractorId, user.sub, dto);
  }

  @Patch(':id')
  update(@Param('contractorId') contractorId: string, @Param('id') id: string, @Body() dto: UpdateRatingDto) {
    return this.ratingsService.update(contractorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('contractorId') contractorId: string, @Param('id') id: string) {
    return this.ratingsService.remove(contractorId, id);
  }
}
