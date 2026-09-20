import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ScheduleActivityType, SchedulePriority, ScheduleActivityStatus } from '../../generated/prisma/enums.js';

export class CreateActivityDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ScheduleActivityType)
  activityType?: ScheduleActivityType;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  percentComplete?: number;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsOptional()
  @IsEnum(ScheduleActivityStatus)
  status?: ScheduleActivityStatus;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  projectNodeId?: string;

  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
