import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ProjectStage } from '../../generated/prisma/enums.js';

export class RequestTransitionDto {
  @IsEnum(ProjectStage)
  toStage!: ProjectStage;

  @IsOptional()
  @IsString()
  comment?: string;

  /** When the client is asked to respond by (App Review, 17 Oct 2026). */
  @IsOptional()
  @IsDateString()
  responseDueAt?: string;
}
