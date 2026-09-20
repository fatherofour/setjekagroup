import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSubmittalDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  specSection?: string;

  @IsOptional()
  @IsString()
  submittalType?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  submittedById?: string;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}
