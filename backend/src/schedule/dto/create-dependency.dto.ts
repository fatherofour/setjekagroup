import { IsEnum, IsNumber, IsUUID, IsOptional } from 'class-validator';
import { ScheduleDependencyType } from '../../generated/prisma/enums.js';

export class CreateDependencyDto {
  @IsUUID()
  predecessorId!: string;

  @IsUUID()
  successorId!: string;

  @IsOptional()
  @IsEnum(ScheduleDependencyType)
  type?: ScheduleDependencyType;

  @IsOptional()
  @IsNumber()
  lagDays?: number;
}
