import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ProjectRiskStatus } from '../../generated/prisma/enums.js';

export class CreateRiskDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  probability!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  impact!: number;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  mitigation?: string;

  @IsOptional()
  @IsEnum(ProjectRiskStatus)
  status?: ProjectRiskStatus;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;
}
