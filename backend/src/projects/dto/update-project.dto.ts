import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MinLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  ClassificationStandard,
  ContractForm,
  Currency,
  ProjectStatus,
  ProjectType,
} from '../../generated/prisma/enums.js';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  // Deliberately not editable here — once a project exists, its stage
  // can only change through an approved StageTransition (see
  // stage-transitions.service.ts), not a bare PATCH.

  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @IsOptional()
  @IsEnum(ContractForm)
  contractForm?: ContractForm;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsEnum(ClassificationStandard)
  classificationStandard?: ClassificationStandard;

  @IsOptional()
  @IsString()
  client?: string;

  @IsOptional()
  @IsString()
  developer?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  contingencyPct?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number;
}
