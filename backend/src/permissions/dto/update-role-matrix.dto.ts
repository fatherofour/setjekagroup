import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ProjectMemberRole, PermissionModule, PermissionAction } from '../../generated/prisma/enums.js';

class RoleMatrixRowDto {
  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole;

  @IsEnum(PermissionModule)
  module!: PermissionModule;

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsBoolean()
  allowed!: boolean;
}

export class UpdateRoleMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleMatrixRowDto)
  rows!: RoleMatrixRowDto[];
}
