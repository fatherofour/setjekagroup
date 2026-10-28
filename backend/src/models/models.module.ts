import { BadRequestException, Body, Controller, Delete, Get, Module, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { generateStoredName, uploadRootDir } from '../project-documents/upload.util.js';
import { ModelIssueDto, ModelLinkDto, ModelsService, UploadModelDto } from './models.service.js';

// IFC models run larger than drawings; nginx gives this route 210 MB.
export const MAX_MODEL_BYTES = 200 * 1024 * 1024;

const modelUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRootDir()),
    filename: (_req, file, cb) => cb(null, generateStoredName(file.originalname)),
  }),
  limits: { fileSize: MAX_MODEL_BYTES },
  fileFilter: (_req, file, cb) => (extname(file.originalname).toLowerCase() === '.ifc' ? cb(null, true) : cb(new BadRequestException('Upload the model as an .ifc file'), false)),
});

@Controller('projects/:projectId/models')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get()
  @RequirePermission('DOCUMENTS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.models.list(projectId, user.sub);
  }

  @Post()
  @UseInterceptors(modelUpload)
  @RequirePermission('DOCUMENTS', 'CREATE')
  upload(@Param('projectId') projectId: string, @Body() dto: UploadModelDto, @CurrentUser() user: JwtPayload, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.models.upload(projectId, user.sub, dto, file);
  }

  @Get(':documentId/links')
  @RequirePermission('DOCUMENTS', 'VIEW')
  links(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @CurrentUser() user: JwtPayload) {
    return this.models.links(projectId, user.sub, documentId);
  }

  @Post(':documentId/links')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  link(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Body() dto: ModelLinkDto, @CurrentUser() user: JwtPayload) {
    return this.models.link(projectId, user.sub, documentId, dto);
  }

  @Delete(':documentId/links/:linkId')
  @RequirePermission('DOCUMENTS', 'COMMENT')
  unlink(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('linkId') linkId: string, @CurrentUser() user: JwtPayload) {
    return this.models.unlink(projectId, user.sub, documentId, linkId);
  }

  @Post(':documentId/issues')
  @RequirePermission('ISSUES', 'CREATE')
  raiseIssue(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Body() dto: ModelIssueDto, @CurrentUser() user: JwtPayload) {
    return this.models.raiseIssue(projectId, user.sub, documentId, dto);
  }
}

@Module({
  imports: [ProjectsModule, PermissionsModule, NotificationsModule],
  controllers: [ModelsController],
  providers: [ModelsService],
})
export class ModelsModule {}
