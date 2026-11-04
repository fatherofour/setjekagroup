import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PlantCategory, PlantOwnership } from '../../generated/prisma/enums.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MSG = 'Give the day as YYYY-MM-DD';

export class AddPlantDto {
  @IsString() @MinLength(1) @MaxLength(200) description!: string;
  @IsEnum(PlantCategory) category!: PlantCategory;
  @IsOptional() @IsString() @MaxLength(100) fleetNumber?: string;
  @IsOptional() @IsEnum(PlantOwnership) ownership?: PlantOwnership;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsUUID() contractorId?: string;
  @IsOptional() @IsString() @MaxLength(200) operator?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) operatorCertExpiry?: string;
  @Matches(DAY, { message: DAY_MSG }) arrivedOn!: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) offHireDue?: string;
  @IsOptional() @IsInt() @Min(1) @Max(730) inspectionIntervalDays?: number;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) lastInspectedOn?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) nextInspectionDue?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) certificateExpiry?: string;
}

/** A null clears a date or text field. */
export class UpdatePlantDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) description?: string;
  @IsOptional() @IsEnum(PlantCategory) category?: PlantCategory;
  @IsOptional() @IsString() @MaxLength(100) fleetNumber?: string | null;
  @IsOptional() @IsEnum(PlantOwnership) ownership?: PlantOwnership;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string | null;
  @IsOptional() @IsString() @MaxLength(200) operator?: string | null;
  @ValidateIf((_, v) => v !== null && v !== undefined) @Matches(DAY, { message: DAY_MSG }) operatorCertExpiry?: string | null;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) arrivedOn?: string;
  @ValidateIf((_, v) => v !== null && v !== undefined) @Matches(DAY, { message: DAY_MSG }) offHireDue?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(730) inspectionIntervalDays?: number;
  @ValidateIf((_, v) => v !== null && v !== undefined) @Matches(DAY, { message: DAY_MSG }) nextInspectionDue?: string | null;
  @ValidateIf((_, v) => v !== null && v !== undefined) @Matches(DAY, { message: DAY_MSG }) certificateExpiry?: string | null;
}

export class PlantStatusDto {
  @IsIn(['WORKING', 'STANDING', 'BROKEN_DOWN']) status!: 'WORKING' | 'STANDING' | 'BROKEN_DOWN';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class InspectPlantDto {
  @Matches(DAY, { message: DAY_MSG }) date!: string;
  @IsBoolean() passed!: boolean;
  @IsOptional() @IsString() @MaxLength(200) inspector?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) nextDue?: string;
  @IsOptional() @IsInt() @Min(1) @Max(730) intervalDays?: number;
  /** A renewed load test or certificate of fitness. */
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) certificateExpiry?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class PlantOffSiteDto {
  @Matches(DAY, { message: DAY_MSG }) date!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
