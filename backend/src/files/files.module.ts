import { BadRequestException, Body, Controller, Delete, Get, Module, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { DistributionListDto, FilesService, RestoreVersionDto, SetTagsDto, TagDto } from './files.service.js';
import { SearchService } from './search.service.js';
import { TextIndexService } from './text-index.service.js';

@Controller('projects/:projectId')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectFilesController {
  constructor(
    private readonly files: FilesService,
    private readonly search: SearchService,
  ) {}

  @Get('documents/search')
  @RequirePermission('DOCUMENTS', 'VIEW')
  find(@Param('projectId') projectId: string, @Query('q') q: string | undefined, @CurrentUser() user: JwtPayload) {
    if (!q) throw new BadRequestException('Type something to search for');
    return this.search.search(user.sub, q, projectId);
  }

  @Get('document-tags')
  @RequirePermission('DOCUMENTS', 'VIEW')
  tags(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.files.tags(projectId, user.sub);
  }

  @Post('document-tags')
  @RequirePermission('DOCUMENTS', 'EDIT')
  createTag(@Param('projectId') projectId: string, @Body() dto: TagDto, @CurrentUser() user: JwtPayload) {
    return this.files.createTag(projectId, user.sub, dto);
  }

  @Patch('document-tags/:id')
  @RequirePermission('DOCUMENTS', 'EDIT')
  updateTag(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: TagDto, @CurrentUser() user: JwtPayload) {
    return this.files.updateTag(projectId, user.sub, id, dto);
  }

  @Delete('document-tags/:id')
  @RequirePermission('DOCUMENTS', 'EDIT')
  deleteTag(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.files.deleteTag(projectId, user.sub, id);
  }

  @Put('documents/:documentId/tags')
  @RequirePermission('DOCUMENTS', 'EDIT')
  setTags(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Body() dto: SetTagsDto, @CurrentUser() user: JwtPayload) {
    return this.files.setDocumentTags(projectId, user.sub, documentId, dto.tagIds);
  }

  @Post('documents/:documentId/revisions/:revisionId/restore')
  @RequirePermission('DOCUMENTS', 'CREATE')
  restore(@Param('projectId') projectId: string, @Param('documentId') documentId: string, @Param('revisionId') revisionId: string, @Body() dto: RestoreVersionDto, @CurrentUser() user: JwtPayload) {
    return this.files.restoreVersion(projectId, user.sub, documentId, revisionId, dto.revisionNumber);
  }

  @Get('distribution-lists')
  @RequirePermission('TRANSMITTALS', 'VIEW')
  lists(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.files.lists(projectId, user.sub);
  }

  @Post('distribution-lists')
  @RequirePermission('TRANSMITTALS', 'CREATE')
  createList(@Param('projectId') projectId: string, @Body() dto: DistributionListDto, @CurrentUser() user: JwtPayload) {
    return this.files.saveList(projectId, user.sub, dto);
  }

  @Put('distribution-lists/:id')
  @RequirePermission('TRANSMITTALS', 'CREATE')
  updateList(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DistributionListDto, @CurrentUser() user: JwtPayload) {
    return this.files.saveList(projectId, user.sub, dto, id);
  }

  @Delete('distribution-lists/:id')
  @RequirePermission('TRANSMITTALS', 'CREATE')
  deleteList(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.files.deleteList(projectId, user.sub, id);
  }
}

/** Search across every project the caller can see, and the admins' recycle
 * bin. */
@Controller()
@UseGuards(JwtAccessGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly search: SearchService,
  ) {}

  @Get('documents/search')
  find(@Query('q') q: string | undefined, @CurrentUser() user: JwtPayload) {
    if (!q) throw new BadRequestException('Type something to search for');
    return this.search.search(user.sub, q);
  }

  @Get('recycle-bin')
  bin(@CurrentUser() user: JwtPayload) {
    return this.files.bin(user.sub);
  }

  @Post('recycle-bin/:id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.files.restore(user.sub, id);
  }

  @Delete('recycle-bin/:id')
  purge(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.files.purge(user.sub, id);
  }
}

@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [ProjectFilesController, FilesController],
  providers: [FilesService, SearchService, TextIndexService],
  exports: [TextIndexService],
})
export class FilesModule {}
