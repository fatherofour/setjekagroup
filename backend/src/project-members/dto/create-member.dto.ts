import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';
import { ProjectMemberRole } from '../../generated/prisma/enums.js';

export class CreateMemberDto {
  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @ValidateIf((dto: CreateMemberDto) => !dto.userId && !dto.contractorId)
  @IsString()
  @MinLength(1)
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

  // Administration module: grants this external contact a real, external
  // login account (accountType: EXTERNAL) instead of leaving them as a
  // contact-info-only member. Requires externalEmail. The generated
  // set-password link comes back on the create response for the admin to
  // copy and share manually - no email provider is connected.
  @IsOptional()
  @IsBoolean()
  inviteAsUser?: boolean;
}
