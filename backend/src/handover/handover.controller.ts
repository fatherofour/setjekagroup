import { Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { HandoverService } from './handover.service.js';
import { HandOverDto, HandoverCommentDto, HandoverItemDto, HandoverReasonDto, SubmitHandoverDto } from './dto/handover.dto.js';
import { MAX_HANDOVER_BYTES, handoverFileFilter, handoverRootDir, storedHandoverName } from './upload.util.js';

const upload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, handoverRootDir()),
    filename: (_req, file, cb) => cb(null, storedHandoverName(file.originalname)),
  }),
  limits: { fileSize: MAX_HANDOVER_BYTES },
  fileFilter: handoverFileFilter,
});

// The handover pack sits with instructions and letters in the permission
// matrix, as completion and defects do: the contractor uploads there and
// the client reads what is handed over. The service decides the rest.
@Controller('projects/:projectId/handover')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class HandoverController {
  constructor(private readonly handover: HandoverService) {}

  @Get('contracts')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  contracts(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.handover.contracts(projectId, user.sub);
  }

  @Post('contracts/:contractId/starter')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  addStarter(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @CurrentUser() user: JwtPayload) {
    return this.handover.addStarter(projectId, user.sub, contractId);
  }

  @Post('contracts/:contractId/hand-over')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  handOver(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Body() dto: HandOverDto, @CurrentUser() user: JwtPayload) {
    return this.handover.handOver(projectId, user.sub, contractId, dto.itemIds);
  }

  @Get()
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.handover.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.handover.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  create(@Param('projectId') projectId: string, @Body() dto: HandoverItemDto, @CurrentUser() user: JwtPayload) {
    return this.handover.create(projectId, user.sub, dto);
  }

  @Delete(':id')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.handover.remove(projectId, user.sub, id);
  }

  @Post(':id/files')
  @UseInterceptors(upload)
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  uploadFile(@Param('projectId') projectId: string, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: JwtPayload) {
    return this.handover.upload(projectId, user.sub, id, file);
  }

  @Delete(':id/files/:fileId')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  removeFile(@Param('projectId') projectId: string, @Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() user: JwtPayload) {
    return this.handover.removeFile(projectId, user.sub, id, fileId);
  }

  @Get(':id/files/:fileId')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  async file(@Param('projectId') projectId: string, @Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() user: JwtPayload, @Res() res: Response) {
    const f = await this.handover.fileFor(projectId, user.sub, id, fileId);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.filename)}"`);
    createReadStream(f.path).pipe(res);
  }

  @Post(':id/submit')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  submit(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: SubmitHandoverDto, @CurrentUser() user: JwtPayload) {
    return this.handover.submit(projectId, user.sub, id, dto);
  }

  @Post(':id/accept')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  accept(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: HandoverCommentDto, @CurrentUser() user: JwtPayload) {
    return this.handover.accept(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/return')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  returnItem(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: HandoverReasonDto, @CurrentUser() user: JwtPayload) {
    return this.handover.return(projectId, user.sub, id, dto.reason);
  }
}
