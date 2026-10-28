import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { InspectionKind, InspectionOutcome, InspectionStatus } from '../../generated/prisma/enums.js';

export class ChecklistItemDto {
  @IsString() @MinLength(1) @MaxLength(500) text!: string;
  @IsOptional() @IsIn(['PASS', 'FAIL', 'NA', null]) result?: 'PASS' | 'FAIL' | 'NA' | null;
  @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}

export class CreateInspectionDto {
  @IsEnum(InspectionKind) kind!: InspectionKind;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(100) workType?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsDateString() requestedFor?: string;
  @IsOptional() @IsUUID() templateId?: string;
  /** Project member who inspects; with a date, the inspection is scheduled. */
  @IsOptional() @IsUUID() inspectorId?: string;
  @IsOptional() @IsDateString() scheduledFor?: string;
}

export class ScheduleInspectionDto {
  @IsUUID() inspectorId!: string;
  @IsDateString() scheduledFor!: string;
}

export class UpdateInspectionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100) workType?: string | null;
  @IsOptional() @IsString() @MaxLength(300) location?: string | null;
  /** Replaces the checklist with the template's items (only before results are recorded). */
  @IsOptional() @IsUUID() templateId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) checklist?: ChecklistItemDto[];
  @IsOptional() @IsString() @MaxLength(5000) summary?: string | null;
}

export class CompleteInspectionDto {
  @IsEnum(InspectionOutcome) outcome!: InspectionOutcome;
  @IsOptional() @IsString() @MaxLength(5000) summary?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) checklist?: ChecklistItemDto[];
}

export class InspectionIssueDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  /** The checklist item it comes from, to note against it. */
  @IsOptional() @IsInt() @Min(0) itemIndex?: number;
}

export class InspectionQuery {
  @IsOptional() @IsEnum(InspectionStatus) status?: InspectionStatus;
  @IsOptional() @IsEnum(InspectionKind) kind?: InspectionKind;
}

export class TemplateDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(100) workType?: string | null;
  @IsOptional() @IsEnum(InspectionKind) kind?: InspectionKind | null;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(500, { each: true }) items!: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
