import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { fileFilter, generateStoredName, uploadRootDir } from '../project-documents/upload.util.js';
import { DrawingsService } from './drawings.service.js';
import { PlannedDrawingDto, UpdateDrawingDto, UpdateDrawingRevisionDto, UploadDrawingDto } from './dto/drawing.dto.js';

// A1 drawing sets run larger than ordinary documents; nginx gives these
// routes 60 MB.
const MAX_DRAWING_BYTES = 50 * 1024 * 1024;

// Reading only needs the bytes in memory; nothing is kept.
const readInterceptor = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DRAWING_BYTES }, fileFilter });
const uploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRootDir()),
    filename: (_req, file, cb) => cb(null, generateStoredName(file.originalname)),
  }),
  limits: { fileSize: MAX_DRAWING_BYTES },
  fileFilter,
});

@Controller('projects/:projectId')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DrawingsController {
  constructor(private readonly drawings: DrawingsService) {}

  @Get('drawings')
  @RequirePermission('DOCUMENTS', 'VIEW')
  register(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.drawings.register(projectId, user.sub);
  }

  @Get('drawings/export')
  @RequirePermission('DOCUMENTS', 'VIEW')
  async export(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { buffer, filename } = await this.drawings.exportRegister(projectId, user.sub);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('drawings/read')
  @UseInterceptors(readInterceptor)
  @RequirePermission('DOCUMENTS', 'CREATE')
  read(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.drawings.read(projectId, user.sub, file);
  }

  @Post('drawings')
  @UseInterceptors(uploadInterceptor)
  @RequirePermission('DOCUMENTS', 'CREATE')
  upload(@Param('projectId') projectId: string, @Body() dto: UploadDrawingDto, @CurrentUser() user: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.drawings.upload(projectId, user.sub, dto, file);
  }

  @Get('documents/:documentId/revisions/:revisionId/drawing.svg')
  @RequirePermission('DOCUMENTS', 'VIEW')
  async cadSvg(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const svg = await this.drawings.cadSvg(projectId, user.sub, documentId, revisionId);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(svg);
  }

  @Post('drawings/index-check')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  @RequirePermission('DOCUMENTS', 'VIEW')
  indexCheck(@Param('projectId') projectId: string, @Body('text') text: string | undefined, @CurrentUser() user: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    return this.drawings.indexCheck(projectId, user.sub, { file, text });
  }

  @Patch('drawings/:documentId')
  @RequirePermission('DOCUMENTS', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Body() dto: UpdateDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.drawings.update(projectId, user.sub, documentId, dto);
  }

  @Patch('drawings/:documentId/revisions/:revisionId')
  @RequirePermission('DOCUMENTS', 'EDIT')
  updateRevision(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: UpdateDrawingRevisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.drawings.updateRevision(projectId, user.sub, documentId, revisionId, dto);
  }

  @Get('drawing-programme')
  @RequirePermission('DOCUMENTS', 'VIEW')
  programme(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.drawings.programme(projectId, user.sub);
  }

  @Post('drawing-programme')
  @RequirePermission('DOCUMENTS', 'CREATE')
  addPlanned(@Param('projectId') projectId: string, @Body() dto: PlannedDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.drawings.addPlanned(projectId, user.sub, dto);
  }

  @Put('drawing-programme/:id')
  @RequirePermission('DOCUMENTS', 'EDIT')
  updatePlanned(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: PlannedDrawingDto, @CurrentUser() user: JwtPayload) {
    return this.drawings.updatePlanned(projectId, user.sub, id, dto);
  }

  @Delete('drawing-programme/:id')
  @RequirePermission('DOCUMENTS', 'EDIT')
  removePlanned(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.drawings.removePlanned(projectId, user.sub, id);
  }
}
