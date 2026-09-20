import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectTasksService } from './project-tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects/:projectId/tasks')
@UseGuards(JwtAccessGuard)
export class ProjectTasksController {
  constructor(private readonly tasksService: ProjectTasksService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.findAll(projectId, user.sub);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.update(projectId, user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tasksService.remove(projectId, user.sub, id);
  }
}
