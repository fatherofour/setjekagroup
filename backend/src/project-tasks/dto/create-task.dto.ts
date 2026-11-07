import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SchedulePriority, ProjectTaskStatus } from '../../generated/prisma/enums.js';

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  // Critique L-10: a title is a line, not a page; detail goes in the description.
  @MaxLength(200)
  title!: string;

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
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  scheduleActivityId?: string;

  @IsOptional()
  @IsUUID()
  projectNodeId?: string;

  @IsOptional()
  @IsArray()
  checklist?: ChecklistItem[];
}
