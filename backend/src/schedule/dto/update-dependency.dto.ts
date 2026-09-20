import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { ScheduleDependencyType } from '../../generated/prisma/enums.js';

export class UpdateDependencyDto {
  @IsOptional()
  @IsEnum(ScheduleDependencyType)
  type?: ScheduleDependencyType;

  @IsOptional()
  @IsNumber()
  lagDays?: number;
}
