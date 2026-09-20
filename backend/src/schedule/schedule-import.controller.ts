import { BadRequestException, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'node:path';
import { ScheduleImportService } from './schedule-import.service.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

@Controller('projects/:projectId/schedule/import')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ScheduleImportController {
  constructor(private readonly importService: ScheduleImportService) {}

  // Parsed in memory and discarded — unlike compliance documents, an
  // imported schedule file isn't kept as an attachment, only its data.
  @Post('msproject')
  @RequirePermission('SCHEDULE', 'CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES },
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() !== '.xml') {
          cb(new BadRequestException('Only MS Project XML exports (.xml) are supported — not .mpp'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async importMsProject(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.importService.importMsProjectXml(projectId, user.sub, file.buffer.toString('utf-8'));
  }
}
