import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RaterType } from '../../generated/prisma/enums.js';

export class CreateRatingDto {
  @IsUUID()
  appointmentId!: string;

  @IsEnum(RaterType)
  raterType!: RaterType;

  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
