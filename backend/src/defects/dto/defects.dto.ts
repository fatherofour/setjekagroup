import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DefectList } from '../../generated/prisma/enums.js';

export class CertifyCompletionDto {
  @IsEnum(['PRACTICAL', 'WORKS', 'FINAL']) stage!: 'PRACTICAL' | 'WORKS' | 'FINAL';
  @IsDateString() date!: string;
}

export class DefectsPeriodDto {
  @IsOptional() @IsInt() @Min(0) @Max(3650) defectsPeriodDays?: number | null;
}

export class DefectDto {
  @IsUUID() contractId!: string;
  @IsEnum(DefectList) list!: DefectList;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class DefectCommentDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
  /** When the contractor is to put it right, on issuing a reported defect. */
  @IsOptional() @IsDateString() dueDate?: string;
}

export class DefectReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}
