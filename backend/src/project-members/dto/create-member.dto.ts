import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';
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
}
