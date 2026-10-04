import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { EstimatesService } from './estimates.service.js';
import { ApplyTakeoffDto, CreateEstimateDto, CreateLineDto, UpdateEstimateDto, UpdateLineDto } from './dto/estimate.dto.js';

// Estimates draw on Setjeka's own price sheets, so internal staff only.
@Controller('estimates')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class EstimatesController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get()
  list(@Query('projectId') projectId?: string, @Query('opportunityId') opportunityId?: string) {
    return this.estimates.list({ projectId: projectId || undefined, opportunityId: opportunityId || undefined });
  }

  @Get('converter-status')
  converterStatus() {
    return this.estimates.converterStatus();
  }

  @Post()
  create(@Body() dto: CreateEstimateDto, @CurrentUser() user: JwtPayload) {
    return this.estimates.create(user.sub, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.estimates.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEstimateDto) {
    return this.estimates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.estimates.remove(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: CreateLineDto) {
    return this.estimates.addLine(id, dto);
  }

  @Patch(':id/lines/:lineId')
  updateLine(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateLineDto) {
    return this.estimates.updateLine(id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.estimates.removeLine(id, lineId);
  }

  @Post(':id/finalise')
  finalise(@Param('id') id: string) {
    return this.estimates.finalise(id);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string) {
    return this.estimates.reopen(id);
  }

  @Post(':id/adopt-budget')
  adopt(@Param('id') id: string) {
    return this.estimates.adoptAsBudget(id);
  }

  // Held in memory and streamed straight to the converter; nothing is
  // written to disk here.
  @Post(':id/takeoffs')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: JwtPayload) {
    return this.estimates.uploadModel(id, user.sub, file);
  }

  @Get(':id/takeoffs/:takeoffId')
  getTakeoff(@Param('id') id: string, @Param('takeoffId') takeoffId: string) {
    return this.estimates.getTakeoff(id, takeoffId);
  }

  @Post(':id/takeoffs/:takeoffId/apply')
  apply(@Param('id') id: string, @Param('takeoffId') takeoffId: string, @Body() dto: ApplyTakeoffDto) {
    return this.estimates.applyTakeoff(id, takeoffId, dto);
  }

  @Delete(':id/takeoffs/:takeoffId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTakeoff(@Param('id') id: string, @Param('takeoffId') takeoffId: string) {
    return this.estimates.removeTakeoff(id, takeoffId);
  }
}
