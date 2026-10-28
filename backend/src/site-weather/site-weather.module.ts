import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { SiteWeatherController } from './site-weather.controller.js';
import { SiteWeatherService } from './site-weather.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [SiteWeatherController],
  providers: [SiteWeatherService],
  exports: [SiteWeatherService],
})
export class SiteWeatherModule {}
