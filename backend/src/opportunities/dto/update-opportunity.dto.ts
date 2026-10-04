import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class UpdateOpportunityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  needAndDesirability?: string | null;

  @IsOptional()
  @IsString()
  clientVision?: string | null;

  @IsOptional()
  @IsString()
  developmentType?: string | null;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedValue?: number | null;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;
}
