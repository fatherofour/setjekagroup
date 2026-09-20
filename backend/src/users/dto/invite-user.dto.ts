import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserAccountType, Role } from '../../generated/prisma/enums.js';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEnum(UserAccountType)
  accountType!: UserAccountType;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
