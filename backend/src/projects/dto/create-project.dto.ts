import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MinLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  ClassificationStandard,
  ContractForm,
  Country,
  Currency,
  ProjectStage,
  ProjectStatus,
  ProjectType,
} from '../../generated/prisma/enums.js';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectStage)
  stage?: ProjectStage;

  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @IsOptional()
  @IsEnum(ContractForm)
  contractForm?: ContractForm;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  /** Sets the site day, the incident rules and (when no currency is given)
   * the currency. South Africa by default. */
  @IsOptional()
  @IsEnum(Country)
  country?: Country;

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
