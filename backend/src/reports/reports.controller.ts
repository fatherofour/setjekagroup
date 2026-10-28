import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { ReportKind } from '../generated/prisma/enums.js';
import { ReportsService } from './reports.service.js';

class GenerateReportDto {
  @IsEnum(ReportKind) kind!: ReportKind;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class ShareReportDto {
  @IsBoolean() clientVisible!: boolean;
}

@Controller('projects/:projectId/reports')
@UseGuards(JwtAccessGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.reports.list(projectId, user.sub);
  }

  @Post()
  generate(@Param('projectId') projectId: string, @Body() dto: GenerateReportDto, @CurrentUser() user: JwtPayload) {
    return this.reports.generate(projectId, user.sub, dto.kind, dto.from, dto.to);
  }

  @Get(':id/file')
  async file(@Param('projectId') projectId: string, @Param('id') id: string, @Query('download') download: string | undefined, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const f = await this.reports.file(projectId, user.sub, id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `${download === '0' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(f.filename)}"`);
    createReadStream(f.path).pipe(res);
  }

  @Patch(':id')
  share(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ShareReportDto, @CurrentUser() user: JwtPayload) {
    return this.reports.share(projectId, user.sub, id, dto.clientVisible);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reports.remove(projectId, user.sub, id);
  }
}
