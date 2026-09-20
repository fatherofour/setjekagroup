import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [ProjectsModule, PermissionsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
