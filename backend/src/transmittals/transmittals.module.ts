import { Module } from '@nestjs/common';
import { TransmittalsController } from './transmittals.controller.js';
import { TransmittalsService } from './transmittals.service.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [ProjectsModule],
  controllers: [TransmittalsController],
  providers: [TransmittalsService],
})
export class TransmittalsModule {}
