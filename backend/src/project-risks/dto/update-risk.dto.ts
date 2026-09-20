import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ProjectRiskStatus } from '../../generated/prisma/enums.js';

export class UpdateRiskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  probability?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @IsString()
  mitigation?: string;

  @IsOptional()
  @IsEnum(ProjectRiskStatus)
  status?: ProjectRiskStatus;

  @IsOptional()
  @IsDateString()
  reviewDate?: string | null;
}
