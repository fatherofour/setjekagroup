import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PermitType } from '../../generated/prisma/enums.js';

export class PermitCheckDto {
  @IsString() @MinLength(1) @MaxLength(300) text!: string;
  @IsBoolean() done!: boolean;
}

export class RequestPermitDto {
  @IsEnum(PermitType) type!: PermitType;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MinLength(1) @MaxLength(4000) description!: string;
  @IsString() @MinLength(1) @MaxLength(300) location!: string;
  @IsOptional() @IsUUID() contractorId?: string;
  @IsOptional() @IsString() @MaxLength(1000) workers?: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  /** The type's precautions with each confirmed; extra ones may be added. */
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => PermitCheckDto) checklist!: PermitCheckDto[];
  @IsOptional() @IsString() @MaxLength(500) gasTest?: string;
}

export class IssuePermitDto {
  @IsOptional() @IsString() @MaxLength(4000) conditions?: string;
}

export class PermitNoteDto {
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

export class PermitReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}
