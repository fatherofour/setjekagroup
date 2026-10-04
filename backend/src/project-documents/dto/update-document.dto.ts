import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
  folderId?: string | null;

  @IsOptional()
  @IsUUID()
  projectNodeId?: string | null;

  @IsOptional()
  @IsUUID()
  scheduleActivityId?: string | null;

  /** Show this document (and its drawings) in the client portal. */
  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;
}
