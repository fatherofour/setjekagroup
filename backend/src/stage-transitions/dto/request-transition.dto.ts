import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProjectStage } from '../../generated/prisma/enums.js';

export class RequestTransitionDto {
  @IsEnum(ProjectStage)
  toStage!: ProjectStage;

  @IsOptional()
  @IsString()
  comment?: string;
}
