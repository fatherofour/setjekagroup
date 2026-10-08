import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { SitePhotosService } from './site-photos.service.js';
import { CreateSitePhotoDto, PhotoVisibilityDto, UpdateSitePhotoDto, type SitePhotoQuery } from './dto/site-photo.dto.js';
import { MAX_PHOTO_BYTES, photoFileFilter, photoRootDir, storedPhotoName } from './upload.util.js';

const uploadInterceptor = FileFieldsInterceptor(
  [
    { name: 'file', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ],
  {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, photoRootDir()),
      filename: (_req, file, cb) => cb(null, storedPhotoName(file.originalname)),
    }),
    limits: { fileSize: MAX_PHOTO_BYTES },
    fileFilter: photoFileFilter,
  },
);

@Controller('projects/:projectId/site-photos')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class SitePhotosController {
  constructor(private readonly photos: SitePhotosService) {}

  @Get()
  @RequirePermission('SITE_PHOTOS', 'VIEW')
  findAll(@Param('projectId') projectId: string, @Query() query: SitePhotoQuery, @CurrentUser() user: JwtPayload) {
    return this.photos.findAll(projectId, user.sub, query);
  }

  @Post()
  @UseInterceptors(uploadInterceptor)
  @RequirePermission('SITE_PHOTOS', 'CREATE')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSitePhotoDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files: { file?: Express.Multer.File[]; thumb?: Express.Multer.File[] },
  ) {
    const file = files?.file?.[0];
    if (!file) throw new BadRequestException('Choose a photo to upload');
    return this.photos.create(projectId, user.sub, dto, file, files.thumb?.[0]);
  }

  @Patch('visibility')
  @RequirePermission('SITE_PHOTOS', 'EDIT')
  setVisibility(@Param('projectId') projectId: string, @Body() dto: PhotoVisibilityDto, @CurrentUser() user: JwtPayload) {
    return this.photos.setVisibility(projectId, user.sub, dto.ids, dto.clientVisible);
  }

  @Get(':id')
  @RequirePermission('SITE_PHOTOS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.photos.findOne(projectId, user.sub, id);
  }

  @Patch(':id')
  @RequirePermission('SITE_PHOTOS', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateSitePhotoDto, @CurrentUser() user: JwtPayload) {
    return this.photos.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('SITE_PHOTOS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.photos.remove(projectId, user.sub, id);
  }

  /** ?size=thumb for the gallery preview; ?download=1 to save the original. */
  @Get(':id/file')
  @RequirePermission('SITE_PHOTOS', 'VIEW')
  async file(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Query('size') size: string | undefined,
    @Query('download') download: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const found = await this.photos.fileFor(projectId, user.sub, id, size === 'thumb' && download !== '1' ? 'thumb' : 'full');
    res.setHeader('Content-Type', found.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(found.filename)}"`);
    createReadStream(found.path).pipe(res);
  }
}
