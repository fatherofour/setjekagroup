import { IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CommentEntityType, SchedulePriority } from '../../generated/prisma/enums.js';

export class CreateCommentDto {
  @IsEnum(CommentEntityType)
  entityType!: CommentEntityType;

  @IsUUID()
  entityId!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  // Notes & actions: address the note to a named person, and optionally
  // make it an action on their list.
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @IsOptional()
  @IsBoolean()
  isAction?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;
}

/** A note on an opportunity (Stage 0, before a project exists). */
export class CreateOpportunityNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @IsOptional()
  @IsBoolean()
  isAction?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;
}

export class ActionStatusDto {
  @IsIn(['OPEN', 'DONE'])
  status!: 'OPEN' | 'DONE';
}
