import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectIssuesService } from './project-issues.service.js';
import { CreateIssueDto } from './dto/create-issue.dto.js';
import { UpdateIssueDto } from './dto/update-issue.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects/:projectId/issues')
@UseGuards(JwtAccessGuard)
export class ProjectIssuesController {
  constructor(private readonly issuesService: ProjectIssuesService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.issuesService.findAll(projectId, user.sub);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateIssueDto, @CurrentUser() user: JwtPayload) {
    return this.issuesService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIssueDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.issuesService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.issuesService.remove(projectId, user.sub, id);
  }
}
