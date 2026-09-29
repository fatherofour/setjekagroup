import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateApprovalDto {
  @IsString()
  @MinLength(1)
  approvalType!: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  evidenceNotes?: string;
}
