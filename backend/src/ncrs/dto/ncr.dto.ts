import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { NcrKind, NcrSeverity } from '../../generated/prisma/enums.js';

export class CreateNcrDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MinLength(1) @MaxLength(8000) description!: string;
  @IsOptional() @IsEnum(NcrKind) kind?: NcrKind;
  @IsOptional() @IsEnum(NcrSeverity) severity?: NcrSeverity;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  /** The contractor's person it is issued to. */
  @IsUUID() assigneeId!: string;
  @IsOptional() @IsUUID() inspectionId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber() costImpact?: number;
  @IsOptional() @IsInt() @Min(-3650) @Max(3650) timeImpactDays?: number;
}

export class UpdateNcrDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(8000) description?: string;
  @IsOptional() @IsEnum(NcrKind) kind?: NcrKind;
  @IsOptional() @IsEnum(NcrSeverity) severity?: NcrSeverity;
  @IsOptional() @IsString() @MaxLength(300) location?: string | null;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsNumber() costImpact?: number | null;
  @IsOptional() @IsInt() @Min(-3650) @Max(3650) timeImpactDays?: number | null;
}

/** The contractor's answer: why it happened and how it will be put right. */
export class RespondNcrDto {
  @IsString() @MinLength(1) @MaxLength(120) rootCauseCategory!: string;
  @IsString() @MinLength(1) @MaxLength(8000) rootCause!: string;
  @IsString() @MinLength(1) @MaxLength(8000) correctiveAction!: string;
  @IsOptional() @IsString() @MaxLength(8000) preventiveAction?: string;
}

export class NcrCommentDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class NcrReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}
