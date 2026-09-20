import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PermissionModule, PermissionAction } from '../../generated/prisma/enums.js';

export class CreateOverrideDto {
  @IsEnum(PermissionModule)
  module!: PermissionModule;

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsOptional()
  @IsString()
  recordId?: string;

  @IsBoolean()
  allowed!: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
