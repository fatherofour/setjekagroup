import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { InceptionModule } from '../inception/inception.module.js';
import { OpportunitiesModule } from '../opportunities/opportunities.module.js';
import { SignoffModule } from '../signoff/signoff.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DeliveryRegistersService } from './delivery-registers.service.js';
import { ProcsaService } from './procsa.service.js';
import { DeliveryController, RegisterDefinitionsController } from './delivery.controller.js';

@Module({
  imports: [ProjectsModule, InceptionModule, OpportunitiesModule, SignoffModule, NotificationsModule],
  controllers: [RegisterDefinitionsController, DeliveryController],
  providers: [DeliveryRegistersService, ProcsaService],
  exports: [ProcsaService],
})
export class DeliveryModule {}
