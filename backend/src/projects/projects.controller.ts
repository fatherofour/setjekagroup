import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

@Controller('projects')
@UseGuards(JwtAccessGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    const rows = await this.projectsService.findAllForOwner(user.sub);
    return Promise.all(rows.map((p) => this.projectsService.forViewer(p, user.sub)));
  }

  // Registered before ':id' so this static path isn't swallowed by the
  // dynamic route.
  @Get('next-code')
  @UseGuards(InternalOnlyGuard)
  async previewNextCode(): Promise<{ projectCode: string }> {
    return { projectCode: await this.projectsService.previewNextProjectCode() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.forViewer(await this.projectsService.findOneForOwner(id, user.sub), user.sub);
  }

  // Only Setjeka creates projects (critique H-04): directly, or from an
  // opportunity at Move to Inception. Outside parties are invited onto them.
  @Post()
  @UseGuards(InternalOnlyGuard)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.create(user.sub, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.update(id, user.sub, dto);
  }
}
