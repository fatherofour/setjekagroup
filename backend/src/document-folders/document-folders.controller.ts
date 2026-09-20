import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DocumentFoldersService } from './document-folders.service.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { UpdateFolderDto } from './dto/update-folder.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

@Controller('projects/:projectId/document-folders')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DocumentFoldersController {
  constructor(private readonly foldersService: DocumentFoldersService) {}

  @Get()
  @RequirePermission('DOCUMENTS', 'VIEW')
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.foldersService.findAll(projectId, user.sub);
  }

  @Post()
  @RequirePermission('DOCUMENTS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: CreateFolderDto, @CurrentUser() user: JwtPayload) {
    return this.foldersService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('DOCUMENTS', 'EDIT')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.foldersService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('DOCUMENTS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.foldersService.remove(projectId, user.sub, id);
  }
}
