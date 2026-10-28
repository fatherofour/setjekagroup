import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CommunicationKind, CommunicationStatus } from '../../generated/prisma/enums.js';

export class CreateCommunicationDto {
  @IsEnum(CommunicationKind) kind!: CommunicationKind;
  @IsString() @MinLength(1) @MaxLength(200) subject!: string;
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
  /** User ids. Ignored for outside parties, whose letters always go to
   * Setjeka's DM and PM. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) recipientIds?: string[];
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsDateString() responseDueAt?: string;
  @IsOptional() @IsBoolean() costImpact?: boolean;
  @IsOptional() @IsBoolean() timeImpact?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) documentIds?: string[];
  /** false keeps it as a draft. */
  @IsOptional() @IsBoolean() send?: boolean;
}

export class UpdateCommunicationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) body?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) recipientIds?: string[];
  @IsOptional() @IsDateString() responseDueAt?: string | null;
  @IsOptional() @IsBoolean() costImpact?: boolean;
  @IsOptional() @IsBoolean() timeImpact?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) documentIds?: string[];
}

export class RespondCommunicationDto {
  @IsString() @MinLength(1) @MaxLength(20000) response!: string;
}

export class CommunicationVariationDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsNumber() estimatedValue!: number;
}

export class CommunicationQuery {
  @IsOptional() @IsEnum(CommunicationKind) kind?: CommunicationKind;
  @IsOptional() @IsEnum(CommunicationStatus) status?: CommunicationStatus;
  /** "mine": written by me or addressed to me. */
  @IsOptional() @IsIn(['mine', 'all']) scope?: 'mine' | 'all';
}
