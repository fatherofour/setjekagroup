import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { OpportunityApprovalStatus } from '../../generated/prisma/enums.js';

export class UpdateApprovalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  approvalType?: string;

  @IsOptional()
  @IsEnum(OpportunityApprovalStatus)
  status?: OpportunityApprovalStatus;

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
