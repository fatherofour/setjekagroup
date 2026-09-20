import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { CommentEntityType } from '../generated/prisma/enums.js';

const VALID_ENTITY_TYPES = Object.values(CommentEntityType);

@Controller('projects/:projectId/comments')
@UseGuards(JwtAccessGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!VALID_ENTITY_TYPES.includes(entityType as CommentEntityType)) throw new BadRequestException('Invalid entityType');
    return this.commentsService.findAll(projectId, user.sub, entityType as CommentEntityType, entityId);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateCommentDto, @CurrentUser() user: JwtPayload) {
    return this.commentsService.create(projectId, user.sub, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.commentsService.remove(projectId, user.sub, id, user.sub);
  }
}
