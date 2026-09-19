import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ProjectNodeType } from '../../generated/prisma/enums.js';

export class CreateNodeDto {
  @IsEnum(ProjectNodeType)
  type!: ProjectNodeType;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
