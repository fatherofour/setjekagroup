import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EstimateLineKind, TakeoffBasis } from '../../generated/prisma/enums.js';

export class CreateEstimateDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsUUID() regionId!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) grossFloorArea?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) preliminariesPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) contingencyPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) overheadProfitPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
}

export class UpdateEstimateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsUUID() regionId?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsNumber() @Min(0) grossFloorArea?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) preliminariesPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) contingencyPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) overheadProfitPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
}

export class CreateLineDto {
  @IsEnum(EstimateLineKind) kind!: EstimateLineKind;
  @IsOptional() @IsUUID() workItemId?: string;
  @IsOptional() @IsUUID() resourceId?: string;
  @IsOptional() @IsUUID() costCodeId?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) lumpSum?: number;
  @IsOptional() @IsNumber() @Min(0) rateOverride?: number;
}

export class UpdateLineDto {
  @IsOptional() @IsUUID() costCodeId?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string | null;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) lumpSum?: number | null;
  @IsOptional() @IsNumber() @Min(0) rateOverride?: number | null;
}

export class TakeoffRowDto {
  @IsString() @MaxLength(300) category!: string;
  @IsString() @MaxLength(300) type!: string;
  @IsUUID() workItemId!: string;
  @IsEnum(TakeoffBasis) basis!: TakeoffBasis;
  /** e.g. 2 to plaster both faces of a wall. */
  @IsOptional() @IsNumber() @Min(0) @Max(1000) factor?: number;
}

export class ApplyTakeoffDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => TakeoffRowDto) rows!: TakeoffRowDto[];
}
