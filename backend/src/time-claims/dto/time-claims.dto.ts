import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DelayCause } from '../../generated/prisma/enums.js';

/** The contractor's notice of a delay event. */
export class NotifyDelayDto {
  @IsUUID() contractId!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsEnum(DelayCause) cause!: DelayCause;
  @IsString() @MinLength(1) @MaxLength(8000) description!: string;
  /** When the delay event began. */
  @IsDateString() eventStartedAt!: string;
  @IsOptional() @IsUUID() scheduleActivityId?: string;
  @IsOptional() @IsUUID() variationId?: string;
  @IsOptional() @IsUUID() rfiId?: string;
}

/** The detailed claim: how many days, any costs, and the particulars. */
export class SubmitClaimDto {
  @IsInt() @Min(1) @Max(3650) requestedDays!: number;
  @IsOptional() @IsNumber() @Min(0) costClaimed?: number;
  @IsString() @MinLength(1) @MaxLength(16000) particulars!: string;
  @IsOptional() @IsDateString() eventEndedAt?: string;
}

/** The Setjeka PM's assessment. */
export class AssessClaimDto {
  @IsInt() @Min(0) @Max(3650) grantedDays!: number;
  @IsOptional() @IsNumber() @Min(0) grantedCost?: number;
  @IsString() @MinLength(1) @MaxLength(16000) assessment!: string;
}

export class RespondClaimDto {
  @IsEnum(['ACCEPTED', 'DISPUTED']) response!: 'ACCEPTED' | 'DISPUTED';
  @IsOptional() @IsString() @MaxLength(8000) note?: string;
}

export class ClaimReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}

export class PenaltyDto {
  @IsOptional() @IsNumber() @Min(0) penaltyPerDay?: number | null;
}
