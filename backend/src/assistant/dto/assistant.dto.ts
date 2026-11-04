import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AssistantTurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(4000) content!: string;
}

export class AskDto {
  @IsString() @MinLength(2) @MaxLength(2000) question!: string;
  /** The project the question is about; none asks about Setjeka's projects as a whole. */
  @IsOptional() @IsUUID() projectId?: string;
  /** The conversation so far, newest last. */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => AssistantTurnDto) history?: AssistantTurnDto[];
}
