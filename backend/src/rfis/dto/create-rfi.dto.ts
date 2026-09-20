import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SchedulePriority } from '../../generated/prisma/enums.js';

export class CreateRfiDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  raisedById?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsNumber()
  costImpactPotential?: number;

  @IsOptional()
  @IsNumber()
  costImpactConfirmed?: number;

  @IsOptional()
  @IsNumber()
  scheduleImpactPotentialDays?: number;

  @IsOptional()
  @IsNumber()
  scheduleImpactConfirmedDays?: number;
}
