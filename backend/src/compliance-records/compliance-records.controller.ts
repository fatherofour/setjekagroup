import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { ComplianceRecordsService } from './compliance-records.service.js';
import { CreateComplianceRecordDto } from './dto/create-compliance-record.dto.js';
import { UpdateComplianceRecordDto } from './dto/update-compliance-record.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { MAX_UPLOAD_BYTES, fileFilter, generateStoredName, uploadRootDir } from './upload.util.js';

@Controller('contractors/:contractorId/compliance')
@UseGuards(JwtAccessGuard)
export class ComplianceRecordsController {
  constructor(private readonly complianceService: ComplianceRecordsService) {}

  @Get()
  findAll(@Param('contractorId') contractorId: string) {
    return this.complianceService.findAll(contractorId);
  }

  @Post()
  create(@Param('contractorId') contractorId: string, @Body() dto: CreateComplianceRecordDto) {
    return this.complianceService.create(contractorId, dto);
  }

  @Patch(':id')
  update(
    @Param('contractorId') contractorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateComplianceRecordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.complianceService.update(contractorId, id, dto, user.sub);
  }

  @Post(':id/document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadRootDir()),
        filename: (_req, file, cb) => cb(null, generateStoredName(file.originalname)),
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter,
    }),
  )
  uploadDocument(
    @Param('contractorId') contractorId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.complianceService.attachDocument(contractorId, id, file);
  }

  @Get(':id/document')
  async downloadDocument(@Param('contractorId') contractorId: string, @Param('id') id: string, @Res() res: Response) {
    const record = await this.complianceService.findOwnedRecord(contractorId, id);
    if (!record.attachmentStoredName) throw new NotFoundException('No document attached to this record');
    const filePath = join(uploadRootDir(), record.attachmentStoredName);
    if (!existsSync(filePath)) throw new NotFoundException('Stored file is missing');

    res.setHeader('Content-Type', record.attachmentMimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.attachmentFilename ?? 'document')}"`);
    createReadStream(filePath).pipe(res);
  }

  @Delete(':id/document')
  removeDocument(@Param('contractorId') contractorId: string, @Param('id') id: string) {
    return this.complianceService.removeDocument(contractorId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('contractorId') contractorId: string, @Param('id') id: string) {
    return this.complianceService.remove(contractorId, id);
  }
}
