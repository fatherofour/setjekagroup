import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { PermissionsController, MemberPermissionOverridesController, MyPermissionsController } from './permissions.controller.js';

@Module({
  controllers: [PermissionsController, MemberPermissionOverridesController, MyPermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
