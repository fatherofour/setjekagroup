import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { LandRightCategory } from '../../generated/prisma/enums.js';

export class CreateApprovalDto {
  @IsString()
  @MinLength(1)
  approvalType!: string;

  @IsOptional()
  @IsEnum(LandRightCategory)
  category?: LandRightCategory;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsString()
  authority?: string;

  @IsOptional()
  @IsString()
  reference?: string;

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
