import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ProjectNodeType } from '../../generated/prisma/enums.js';

export class UpdateNodeDto {
  @IsOptional()
  @IsEnum(ProjectNodeType)
  type?: ProjectNodeType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
