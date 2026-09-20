import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateRfqDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  scopeDescription?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
