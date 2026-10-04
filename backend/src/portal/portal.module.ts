import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PortalAccessService } from './portal-access.service.js';
import { PortalAccessController } from './portal-access.controller.js';
import { PortalViewsService } from './portal-views.service.js';
import { ClientProjectsService } from './client-projects.service.js';
import { CommercialModule } from '../commercial/commercial.module.js';
import { ClientPortalController, VendorPortalController } from './portal-views.controller.js';

@Module({
  imports: [UsersModule, AuthModule, CommercialModule],
  controllers: [PortalAccessController, ClientPortalController, VendorPortalController],
  providers: [PortalAccessService, PortalViewsService, ClientProjectsService],
})
export class PortalModule {}
