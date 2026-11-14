import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { FirmDealsController } from './firm-deals.controller.js';
import { FirmDealsService } from './firm-deals.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [FirmDealsController],
  providers: [FirmDealsService],
})
export class FirmDealsModule {}
