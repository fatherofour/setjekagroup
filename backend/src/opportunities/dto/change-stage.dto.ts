import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OpportunityStage } from '../../generated/prisma/enums.js';

export class ChangeOpportunityStageDto {
  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;

  @IsOptional()
  @IsString()
  comment?: string;
}
