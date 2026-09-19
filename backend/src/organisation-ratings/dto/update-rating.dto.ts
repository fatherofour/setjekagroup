import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RaterType } from '../../generated/prisma/enums.js';

export class UpdateRatingDto {
  @IsOptional()
  @IsEnum(RaterType)
  raterType?: RaterType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
