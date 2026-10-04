import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Currency, LandAcquisitionStatus, OpportunitySiteStatus } from '../../generated/prisma/enums.js';

export class CreateOpportunitySiteDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  erfNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeSqm?: number;

  @IsOptional()
  @IsString()
  zoning?: string;

  @IsOptional()
  @IsString()
  ownership?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  askingPrice?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOpportunitySiteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  erfNumber?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeSqm?: number | null;

  @IsOptional()
  @IsString()
  zoning?: string | null;

  @IsOptional()
  @IsString()
  ownership?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  askingPrice?: number | null;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency | null;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  // SELECTED is not settable here - use POST .../select, which also clears
  // any previously selected site.
  @IsOptional()
  @IsEnum(OpportunitySiteStatus)
  status?: OpportunitySiteStatus;

  @IsOptional()
  @IsEnum(LandAcquisitionStatus)
  acquisitionStatus?: LandAcquisitionStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  agreedPrice?: number | null;

  @IsOptional()
  @IsDateString()
  agreementDate?: string | null;

  @IsOptional()
  @IsDateString()
  transferDate?: string | null;
}
