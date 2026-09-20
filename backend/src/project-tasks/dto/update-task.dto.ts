import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SchedulePriority, ProjectTaskStatus } from '../../generated/prisma/enums.js';
import type { ChecklistItem } from './create-task.dto.js';

export class UpdateTaskDto {
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
  @IsEnum(ProjectTaskStatus)
  status?: ProjectTaskStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;

  @IsOptional()
  @IsUUID()
  scheduleActivityId?: string | null;

  @IsOptional()
  @IsUUID()
  projectNodeId?: string | null;

  @IsOptional()
  @IsArray()
  checklist?: ChecklistItem[];
}
