import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { LandRightCategory, OpportunityApprovalStatus } from '../../generated/prisma/enums.js';

export class UpdateApprovalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  approvalType?: string;

  @IsOptional()
  @IsEnum(LandRightCategory)
  category?: LandRightCategory | null;

  @IsOptional()
  @IsUUID()
  siteId?: string | null;

  @IsOptional()
  @IsString()
  authority?: string | null;

  @IsOptional()
  @IsString()
  reference?: string | null;

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
