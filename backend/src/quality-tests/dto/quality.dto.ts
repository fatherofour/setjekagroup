import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { HoldPointKind, TestOutcome, TestRule } from '../../generated/prisma/enums.js';

export class CriterionDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(120) standardRef?: string;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsEnum(TestRule) rule!: TestRule;
  @IsOptional() @IsNumber() minValue?: number;
  @IsOptional() @IsNumber() maxValue?: number;
  @IsOptional() @IsString() @MaxLength(300) frequency?: string;
}

export class UpdateCriterionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(120) standardRef?: string | null;
  @IsOptional() @IsString() @MaxLength(40) unit?: string | null;
  @IsOptional() @IsEnum(TestRule) rule?: TestRule;
  @IsOptional() @IsNumber() minValue?: number | null;
  @IsOptional() @IsNumber() maxValue?: number | null;
  @IsOptional() @IsString() @MaxLength(300) frequency?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RecordTestDto {
  @IsUUID() criterionId!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  /** Whose work it is. A contractor's own results are theirs automatically. */
  @IsOptional() @IsUUID() contractorId?: string;
  @IsOptional() @IsUUID() scheduleActivityId?: string;
  @IsOptional() @IsUUID() holdPointId?: string;
  @IsOptional() @IsUUID() retestOfId?: string;
  @IsOptional() @IsString() @MaxLength(120) sampleRef?: string;
  @IsOptional() @IsString() @MaxLength(200) laboratory?: string;
  @IsOptional() @IsDateString() sampledAt?: string;
  @IsDateString() testedAt!: string;
  /** The measured value; checked against the criterion. */
  @IsOptional() @IsNumber() value?: number;
  /** Only for a pass/fail criterion. */
  @IsOptional() @IsEnum(TestOutcome) outcome?: TestOutcome;
  @IsOptional() @IsString() @MaxLength(4000) remarks?: string;
}

export class ReviewTestDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class HoldPointDto {
  @IsEnum(HoldPointKind) kind!: HoldPointKind;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsUUID() scheduleActivityId?: string;
  @IsOptional() @IsUUID() criterionId?: string;
  @IsOptional() @IsUUID() contractorId?: string;
  /** The team member who releases or witnesses it. */
  @IsOptional() @IsUUID() releaserId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(720) noticeHours?: number;
}

export class NotifyHoldPointDto {
  /** When the work will be ready to inspect or witness. */
  @IsDateString() readyAt!: string;
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class HoldPointCommentDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class HoldPointReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}
