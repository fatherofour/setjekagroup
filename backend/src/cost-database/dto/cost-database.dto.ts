import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
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
import { CostCodeCategory, CostResourceType, Currency, TakeoffBasis } from '../../generated/prisma/enums.js';

export class CreateRegionDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsEnum(Currency) currency!: Currency;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateRegionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string | null;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateResourceDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEnum(CostResourceType) type!: CostResourceType;
  @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsEnum(CostResourceType) type?: CostResourceType;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) unit?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetPriceDto {
  @IsNumber() @Min(0) rate!: number;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class PriceSheetEntryDto {
  @IsUUID() resourceId!: string;
  @IsNumber() @Min(0) rate!: number;
}

export class PriceSheetDto {
  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => PriceSheetEntryDto) prices!: PriceSheetEntryDto[];
  @IsOptional() @IsString() @MaxLength(200) source?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class ComponentDto {
  @IsUUID() resourceId!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500) wastePct?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateWorkItemDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() costCodeId?: string;
  @IsOptional() @IsEnum(TakeoffBasis) takeoffBasis?: TakeoffBasis;
  @IsOptional() @IsArray() @IsString({ each: true }) takeoffKeywords?: string[];
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ComponentDto) components!: ComponentDto[];
}

export class UpdateWorkItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) unit?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUUID() costCodeId?: string | null;
  @IsOptional() @IsEnum(TakeoffBasis) takeoffBasis?: TakeoffBasis | null;
  @IsOptional() @IsArray() @IsString({ each: true }) takeoffKeywords?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** When present, replaces the whole build-up. */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ComponentDto) components?: ComponentDto[];
}

export class CreateCostCodeDto {
  @IsString() @MinLength(1) @MaxLength(20) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(CostCodeCategory) category!: CostCodeCategory;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateCostCodeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(CostCodeCategory) category?: CostCodeCategory;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFxRateDto {
  @IsEnum(Currency) fromCurrency!: Currency;
  @IsEnum(Currency) toCurrency!: Currency;
  @IsNumber() @Min(0.0000001) rate!: number;
  @IsDateString() effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
}
