import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserAccountType, Role } from '../../generated/prisma/enums.js';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserAccountType)
  accountType?: UserAccountType;
}
