import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  discipline?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsUUID()
  projectNodeId?: string;

  @IsOptional()
  @IsUUID()
  scheduleActivityId?: string;

  // The initial revision's number (e.g. "A", "1") — a document can't exist
  // without at least one revision, so this rides along on the same create
  // call rather than requiring a second round-trip.
  @IsOptional()
  @IsString()
  revisionNumber?: string;
}
