import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IssuePurpose, ProjectStage } from '../../generated/prisma/enums.js';

/** Multipart: every field arrives as a string. */
export class UploadDrawingDto {
  @IsString() @MinLength(1) @MaxLength(60) drawingNumber!: string;
  @IsString() @MinLength(1) @MaxLength(10) revision!: string;
  /** Required for a drawing not yet on the register. */
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(IssuePurpose) purpose?: IssuePurpose;
  @IsOptional() @IsDateString() revisionDate?: string;
  @IsOptional() @IsString() @MaxLength(100) discipline?: string;
  @IsOptional() @IsString() @MaxLength(30) originator?: string;
  @IsOptional() @IsIn(['TITLE_BLOCK', 'FILE_NAME', 'MANUAL']) numberSource?: 'TITLE_BLOCK' | 'FILE_NAME' | 'MANUAL';
  /** JSON of what was read off the sheet, kept with the revision. */
  @IsOptional() @IsString() @MaxLength(5000) titleBlock?: string;
}

export class UpdateDrawingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) drawingNumber?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100) discipline?: string | null;
  @IsOptional() @IsString() @MaxLength(30) originator?: string | null;
}

export class UpdateDrawingRevisionDto {
  @IsOptional() @IsEnum(IssuePurpose) purpose?: IssuePurpose | null;
  @IsOptional() @IsDateString() revisionDate?: string | null;
}

export class PlannedDrawingDto {
  @IsOptional() @IsString() @MaxLength(60) drawingNumber?: string | null;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(100) discipline?: string | null;
  @IsEnum(ProjectStage) stage!: ProjectStage;
  @IsEnum(IssuePurpose) purpose!: IssuePurpose;
  @IsDateString() plannedDate!: string;
  @IsOptional() @IsUUID() responsibleId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}
