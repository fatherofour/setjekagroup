import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

/** The Setjeka assistant (2026-11-04). */
@Module({
  imports: [ProjectsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
