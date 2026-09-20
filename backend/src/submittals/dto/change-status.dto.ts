import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SubmittalStatus } from '../../generated/prisma/enums.js';

export class ChangeSubmittalStatusDto {
  @IsEnum(SubmittalStatus)
  status!: SubmittalStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
