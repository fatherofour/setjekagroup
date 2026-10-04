import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service.js';
import { ActionStatusDto, CreateCommentDto, CreateOpportunityNoteDto } from './dto/create-comment.dto.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { CommentEntityType } from '../generated/prisma/enums.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';

const VALID_ENTITY_TYPES = Object.values(CommentEntityType);

@Controller('projects/:projectId/comments')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @RequirePermission('COMMENTS', 'VIEW')
  findAll(
    @Param('projectId') projectId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!VALID_ENTITY_TYPES.includes(entityType as CommentEntityType)) throw new BadRequestException('Invalid entityType');
    return this.commentsService.findAll(projectId, user.sub, entityType as CommentEntityType, entityId);
  }

  /** Who a note can be addressed to. */
  @Get('people')
  @RequirePermission('COMMENTS', 'VIEW')
  people(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.commentsService.people(projectId, user.sub);
  }

  @Post()
  @RequirePermission('COMMENTS', 'COMMENT')
  create(@Param('projectId') projectId: string, @Body() dto: CreateCommentDto, @CurrentUser() user: JwtPayload) {
    return this.commentsService.create(projectId, user.sub, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('COMMENTS', 'DELETE')
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.commentsService.remove(projectId, user.sub, id, user.sub);
  }
}

/** Register COL "Action register" for one project. */
@Controller('projects/:projectId/actions')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProjectActionsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @RequirePermission('COMMENTS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.commentsService.projectActions(projectId, user.sub);
  }
}

/** The signed-in user's own notes and actions ("My Day"). */
@Controller('me')
@UseGuards(JwtAccessGuard)
export class MyNotesController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('actions')
  mine(@CurrentUser() user: JwtPayload) {
    return this.commentsService.mine(user.sub);
  }

  @Patch('notes/:id/action')
  setActionStatus(@Param('id') id: string, @Body() dto: ActionStatusDto, @CurrentUser() user: JwtPayload) {
    return this.commentsService.setActionStatus(id, user.sub, dto, {});
  }

  @Post('notes/:id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.commentsService.acknowledge(id, user.sub);
  }
}

/** Notes on an opportunity, before a project exists (internal staff). */
@Controller('opportunities/:opportunityId/notes')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class OpportunityNotesController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  list(@Param('opportunityId') opportunityId: string) {
    return this.commentsService.opportunityNotes(opportunityId);
  }

  @Get('people')
  people(@CurrentUser() user: JwtPayload) {
    return this.commentsService.opportunityPeople(user.sub);
  }

  @Post()
  create(@Param('opportunityId') opportunityId: string, @Body() dto: CreateOpportunityNoteDto, @CurrentUser() user: JwtPayload) {
    return this.commentsService.addOpportunityNote(opportunityId, user.sub, dto);
  }
}
