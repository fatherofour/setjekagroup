import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IncidentKind, IncidentSeverity } from '../../generated/prisma/enums.js';

export class ReportIncidentDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsEnum(IncidentKind) kind!: IncidentKind;
  @IsEnum(IncidentSeverity) severity!: IncidentSeverity;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsString() @MinLength(1) @MaxLength(8000) description!: string;
  @IsOptional() @IsString() @MaxLength(4000) immediateAction?: string;
  @IsOptional() @IsString() @MaxLength(1000) personsInvolved?: string;
  /** The contractor whose work or people were involved. */
  @IsOptional() @IsUUID() contractorId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3650) lostDays?: number;
}

/** The investigation, by the HSE manager or Setjeka. */
export class InvestigateIncidentDto {
  @IsOptional() @IsEnum(IncidentSeverity) severity?: IncidentSeverity;
  @IsOptional() @IsInt() @Min(0) @Max(3650) lostDays?: number | null;
  @IsOptional() @IsString() @MaxLength(8000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(16000) investigationNotes?: string;
  @IsOptional() @IsBoolean() reportable?: boolean;
  @IsOptional() @IsDateString() reportedToDelAt?: string | null;
  @IsOptional() @IsString() @MaxLength(120) delReference?: string | null;
}

export class IncidentActionDto {
  @IsString() @MinLength(1) @MaxLength(2000) description!: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class IncidentNoteDto {
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
}
