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
  Query,
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
import { ProjectDocumentsService } from './project-documents.service.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';
import { CreateRevisionDto } from './dto/create-revision.dto.js';
import { ReviewRevisionDto } from './dto/review-revision.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { MAX_UPLOAD_BYTES, fileFilter, generateStoredName, uploadRootDir } from './upload.util.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

const uploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRootDir()),
    filename: (_req, file, cb) => cb(null, generateStoredName(file.originalname)),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter,
});

@Controller('projects/:projectId/documents')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectDocumentsController {
  constructor(private readonly documentsService: ProjectDocumentsService) {}

  @Get()
  @RequirePermission('DOCUMENTS', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.documentsService.findAll(projectId, user.sub);
  }

  @Post()
  @UseInterceptors(uploadInterceptor)
  @RequirePermission('DOCUMENTS', 'CREATE')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('An initial revision file is required');
    return this.documentsService.create(projectId, user.sub, user.sub, dto, file);
  }

  @Patch(':id')
  @RequirePermission('DOCUMENTS', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('DOCUMENTS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.documentsService.remove(projectId, user.sub, id);
  }

  @Post(':id/revisions')
  @UseInterceptors(uploadInterceptor)
  @RequirePermission('DOCUMENTS', 'CREATE')
  addRevision(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateRevisionDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.documentsService.addRevision(projectId, user.sub, id, user.sub, dto, file);
  }

  @Patch(':id/revisions/:revisionId/review')
  @RequirePermission('DOCUMENTS', 'APPROVE')
  reviewRevision(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: ReviewRevisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.reviewRevision(projectId, user.sub, id, revisionId, user.sub, dto);
  }

  @Get(':id/revisions/:revisionId/file')
  @RequirePermission('DOCUMENTS', 'VIEW')
  async getRevisionFile(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Query('download') download: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const revision = await this.documentsService.getRevisionForDownload(
      projectId,
      user.sub,
      id,
      revisionId,
      user.sub,
      download === '1' ? 'DOWNLOADED' : 'VIEWED',
    );
    const filePath = join(uploadRootDir(), revision.storedFilename);
    if (!existsSync(filePath)) throw new NotFoundException('Stored file is missing');

    res.setHeader('Content-Type', revision.mimeType);
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(revision.originalFilename)}"`);
    createReadStream(filePath).pipe(res);
  }
}
