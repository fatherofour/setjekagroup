import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApprovalOutcome, SignatureMethod } from '../../generated/prisma/enums.js';

export class SignatureInputDto {
  @IsEnum(SignatureMethod) method!: SignatureMethod;
  /** A PNG data URL (drawn, typed or uploaded - the browser turns every kind
   * into a PNG). Not needed for ACCEPTED, or when useSaved is set. */
  @IsOptional() @IsString() @MaxLength(1_500_000) image?: string;
  @IsOptional() @IsBoolean() useSaved?: boolean;
  @IsOptional() @IsBoolean() saveForNextTime?: boolean;
}

/** One decision on anything the client approves: a Stage 1 document, a
 * variation, a stage move or a document revision. `approve` is the older
 * yes/no form, still accepted. */
export class DecisionDto {
  @IsOptional() @IsEnum(ApprovalOutcome) outcome?: ApprovalOutcome;
  @IsOptional() @IsBoolean() approve?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
  @IsOptional() @ValidateNested() @Type(() => SignatureInputDto) signature?: SignatureInputDto;
  /** The signer's name, typed as they sign; printed on the signed document. */
  @IsOptional() @IsString() @MaxLength(120) signedName?: string;
}

/** Sending something to the client: an optional note, and when they're
 * asked to respond by. */
export class SendForDecisionDto {
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsDateString() responseDueAt?: string;
}

export const OUTCOME_LABEL: Record<ApprovalOutcome, string> = {
  APPROVED: 'Approved',
  APPROVED_WITH_COMMENTS: 'Approved with comments',
  REJECTED: 'Rejected',
  REJECTED_WITH_COMMENTS: 'Rejected with comments',
};

export const isApproval = (o: ApprovalOutcome) => o === 'APPROVED' || o === 'APPROVED_WITH_COMMENTS';

/** The outcome a decision stands for, with its comment checked. */
export function resolveOutcome(dto: DecisionDto): { outcome: ApprovalOutcome; comment: string | undefined } {
  const comment = dto.comment?.trim() || undefined;
  const outcome: ApprovalOutcome | undefined = dto.outcome ?? (dto.approve === true ? 'APPROVED' : dto.approve === false ? 'REJECTED_WITH_COMMENTS' : undefined);
  if (!outcome) throw new BadRequestException('Choose Approved, Approved with comments, Rejected or Rejected with comments');
  if (outcome.endsWith('WITH_COMMENTS') && !comment) throw new BadRequestException('Add your comments');
  return { outcome, comment };
}

/** A response deadline from the request, never in the past. */
export function responseDue(value: string | undefined): Date | null {
  if (!value) return null;
  // A bare date means the end of that South African calendar day.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+02:00` : value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid response date');
  if (d.getTime() < Date.now() - 60_000) throw new BadRequestException('The response date is in the past');
  return d;
}
