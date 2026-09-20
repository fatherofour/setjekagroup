import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateSubmittalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  specSection?: string;

  @IsOptional()
  @IsString()
  submittalType?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  submittedById?: string | null;

  @IsOptional()
  @IsUUID()
  reviewerId?: string | null;

  @IsOptional()
  @IsUUID()
  documentId?: string | null;
}
