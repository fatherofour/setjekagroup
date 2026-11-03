import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { HandoverKind } from '../../generated/prisma/enums.js';

export class HandoverItemDto {
  @IsUUID() contractId!: string;
  @IsEnum(HandoverKind) kind!: HandoverKind;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(120) system?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

/** The contractor's submission: a warranty or guarantee says who gives it
 * and until when. */
export class SubmitHandoverDto {
  @IsOptional() @IsString() @MaxLength(200) issuer?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class HandoverCommentDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class HandoverReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}

export class HandOverDto {
  /** Particular accepted items; all the contract's accepted items if empty. */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) itemIds?: string[];
}
