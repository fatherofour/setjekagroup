import { IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ProjectMemberRole } from '../../generated/prisma/enums.js';

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(ProjectMemberRole)
  role?: ProjectMemberRole;

  @IsOptional()
  @IsUUID()
  contractorId?: string | null;

  @IsOptional()
  @IsString()
  externalName?: string;

  @IsOptional()
  @IsString()
  externalCompany?: string;

  @IsOptional()
  @IsEmail()
  externalEmail?: string;

  @IsOptional()
  @IsString()
  externalPhone?: string;
}
