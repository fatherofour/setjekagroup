import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SchedulePriority, ProjectIssueStatus } from '../../generated/prisma/enums.js';

export class UpdateIssueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsOptional()
  @IsString()
  impact?: string;

  @IsOptional()
  @IsEnum(ProjectIssueStatus)
  status?: ProjectIssueStatus;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;
}
