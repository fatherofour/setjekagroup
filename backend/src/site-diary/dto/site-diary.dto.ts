import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DiaryLabourDto {
  @IsString() @MinLength(1) @MaxLength(120) party!: string;
  @IsOptional() @IsString() @MaxLength(120) trade?: string;
  @IsInt() @Min(0) @Max(5000) count!: number;
}

export class DiaryPlantDto {
  @IsString() @MinLength(1) @MaxLength(160) description!: string;
  @IsInt() @Min(0) @Max(500) count!: number;
  @IsEnum(['WORKING', 'STANDING', 'BROKEN_DOWN']) state!: 'WORKING' | 'STANDING' | 'BROKEN_DOWN';
}

export class SaveDiaryDto {
  @IsOptional() @IsNumber() @Min(0) @Max(24) workingHours?: number;
  @IsOptional() @IsString() @MaxLength(500) weatherNote?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => DiaryLabourDto) labour?: DiaryLabourDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => DiaryPlantDto) plant?: DiaryPlantDto[];
  @IsOptional() @IsString() @MaxLength(4000) visitors?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) deliveries?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) delays?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) instructions?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) safety?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) notes?: string | null;
}
