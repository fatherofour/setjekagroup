import { Body, Controller, Get, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { InceptionModule } from '../inception/inception.module.js';
import { AuthoritiesService, ConsentDto, ConsentEventDto } from './authorities.service.js';

@Controller('projects/:projectId/authorities')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class AuthoritiesController {
  constructor(private readonly authorities: AuthoritiesService) {}

  @Get()
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.authorities.list(projectId, user.sub);
  }

  @Post()
  @RequirePermission('PROJECT_DEFINITION', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: ConsentDto, @CurrentUser() user: JwtPayload) {
    return this.authorities.create(projectId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ConsentDto, @CurrentUser() user: JwtPayload) {
    return this.authorities.update(projectId, user.sub, id, dto);
  }

  @Post(':id/events')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  addEvent(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: ConsentEventDto, @CurrentUser() user: JwtPayload) {
    return this.authorities.addEvent(projectId, user.sub, id, dto);
  }
}

@Module({
  imports: [ProjectsModule, PermissionsModule, InceptionModule],
  controllers: [AuthoritiesController],
  providers: [AuthoritiesService],
})
export class AuthoritiesModule {}
