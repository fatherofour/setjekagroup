import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SchedulePriority, RfiStatus } from '../../generated/prisma/enums.js';

export class UpdateRfiDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsOptional()
  @IsEnum(RfiStatus)
  status?: RfiStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  raisedById?: string | null;

  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;

  @IsOptional()
  @IsUUID()
  documentId?: string | null;

  @IsOptional()
  @IsNumber()
  costImpactPotential?: number | null;

  @IsOptional()
  @IsNumber()
  costImpactConfirmed?: number | null;

  @IsOptional()
  @IsNumber()
  scheduleImpactPotentialDays?: number | null;

  @IsOptional()
  @IsNumber()
  scheduleImpactConfirmedDays?: number | null;
}
