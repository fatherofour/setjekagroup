import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** Multipart upload: every field arrives as a string, so numbers, flags and
 * tags are parsed in SitePhotosService.fromForm. */
export class CreateSitePhotoDto {
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsDateString() takenAt?: string;
  @IsOptional() @IsString() latitude?: string;
  @IsOptional() @IsString() longitude?: string;
  @IsOptional() @IsString() locationNote?: string;
  /** Comma-separated. */
  @IsOptional() @IsString() tags?: string;
  @IsOptional() @IsIn(['true', 'false']) clientVisible?: string;
  @IsOptional() @IsUUID() projectNodeId?: string;
  @IsOptional() @IsUUID() scheduleActivityId?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() issueId?: string;
}

export class UpdateSitePhotoDto {
  @IsOptional() @IsString() caption?: string | null;
  @IsOptional() @IsDateString() takenAt?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsString() locationNote?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() clientVisible?: boolean;
  @IsOptional() @IsUUID() projectNodeId?: string | null;
  @IsOptional() @IsUUID() scheduleActivityId?: string | null;
  @IsOptional() @IsUUID() taskId?: string | null;
  @IsOptional() @IsUUID() issueId?: string | null;
}

export class PhotoVisibilityDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids!: string[];
  @IsBoolean() clientVisible!: boolean;
}

export interface SitePhotoQuery {
  q?: string;
  from?: string;
  to?: string;
  issueId?: string;
  taskId?: string;
  scheduleActivityId?: string;
  projectNodeId?: string;
  uploadedById?: string;
  shared?: 'yes' | 'no';
}
