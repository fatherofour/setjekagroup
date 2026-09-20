import { Module } from '@nestjs/common';
import { ProjectMembersController } from './project-members.controller.js';
import { ProjectMembersService } from './project-members.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, UsersModule, AuthModule, PermissionsModule],
  controllers: [ProjectMembersController],
  providers: [ProjectMembersService],
})
export class ProjectMembersModule {}
