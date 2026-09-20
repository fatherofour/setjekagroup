import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateScorecardDto {
  @IsUUID()
  appointmentId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  costScore!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  qualityScore!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  deliveryScore!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  safetyScore!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  documentationScore!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
