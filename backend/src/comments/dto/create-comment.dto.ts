import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator';
import { CommentEntityType } from '../../generated/prisma/enums.js';

export class CreateCommentDto {
  @IsEnum(CommentEntityType)
  entityType!: CommentEntityType;

  @IsUUID()
  entityId!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}
