import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ContractForm, CostPlanItemType, CostPlanKind, Currency, type ProjectMemberRole } from '../../generated/prisma/enums.js';
import { CONTRACT_REVIEWERS } from '../../common/consultants.js';
import { DecisionDto } from '../../signoff/dto/decision.dto.js';

export class CreateCostPlanDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsEnum(CostPlanKind) kind!: CostPlanKind;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsNumber() @Min(0) grossFloorArea?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) prelimsPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) contingencyPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) escalationPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsString() notes?: string;
  /** Start from another bill's items, e.g. the detailed estimate from the elemental one. */
  @IsOptional() @IsUUID() copyFromId?: string;
}

export class UpdateCostPlanDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(CostPlanKind) kind?: CostPlanKind;
  @IsOptional() @IsNumber() @Min(0) grossFloorArea?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) prelimsPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) contingencyPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) escalationPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsString() notes?: string | null;
}

export class CostPlanItemDto {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsString() @MaxLength(200) section?: string | null;
  @IsOptional() @IsString() @MaxLength(40) ref?: string | null;
  @IsString() @MinLength(1) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string | null;
  @IsOptional() @IsNumber() quantity?: number | null;
  @IsOptional() @IsNumber() rate?: number | null;
  /** Only for a lump sum (no quantity and rate). */
  @IsOptional() @IsNumber() amount?: number | null;
  @IsOptional() @IsEnum(CostPlanItemType) type?: CostPlanItemType;
  @IsOptional() @IsUUID() costCodeId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class SaveItemsDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => CostPlanItemDto) items!: CostPlanItemDto[];
}

export class ImportBoqDto {
  @IsOptional() @IsIn(['replace', 'append']) mode?: 'replace' | 'append';
}

export class IssueCostPlanDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class CreateTenderDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() scopeDescription?: string;
}

export class CreateContractDto {
  @IsUUID() contractorId!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsEnum(ContractForm) contractForm?: ContractForm;
  @IsNumber() @Min(0) contractSum!: number;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsUUID() costPlanId?: string;
  @IsOptional() @IsIn(CONTRACT_REVIEWERS) reviewerRole?: ProjectMemberRole;
  /** Paid on quantities measured on site rather than % complete. */
  @IsOptional() @IsBoolean() measured?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionLimitPct?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  /** Days to certify and to pay, from the contract data; empty uses the form's usual periods. */
  @IsOptional() @IsInt() @Min(1) @Max(180) certifyWithinDays?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(180) payWithinDays?: number | null;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() completionDate?: string;
}

export class UpdateContractDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(ContractForm) contractForm?: ContractForm | null;
  @IsOptional() @IsNumber() @Min(0) contractSum?: number;
  @IsOptional() @IsUUID() costPlanId?: string | null;
  @IsOptional() @IsIn(CONTRACT_REVIEWERS) reviewerRole?: ProjectMemberRole;
  @IsOptional() @IsBoolean() measured?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionLimitPct?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsInt() @Min(1) @Max(180) certifyWithinDays?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(180) payWithinDays?: number | null;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() completionDate?: string | null;
}

export class ContractFromAwardDto {
  @IsUUID() rfqId!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(ContractForm) contractForm?: ContractForm;
  @IsOptional() @IsIn(CONTRACT_REVIEWERS) reviewerRole?: ProjectMemberRole;
  @IsOptional() @IsBoolean() measured?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionLimitPct?: number | null;
}

export class FinalAccountActionDto {
  @IsIn(['prepare', 'submit', 'agree']) action!: 'prepare' | 'submit' | 'agree';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CashFlowDto {
  /** The first month, e.g. 2026-11. */
  @IsString() @MinLength(7) @MaxLength(10) startMonth!: string;
  @IsInt() @Min(1) @Max(120) months!: number;
}

export class CreateValuationDto {
  @IsUUID() contractId!: string;
  @IsDateString() valuationDate!: string;
  @IsOptional() @IsBoolean() isFinal?: boolean;
}

export class ValuationLineDto {
  @IsUUID() id!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentComplete?: number;
  /** On a measured contract: the quantity measured to date (it can run past the bill). */
  @IsOptional() @IsNumber() @Min(0) quantityToDate?: number;
}

export class CreateMeasurementDto {
  @IsUUID() costPlanItemId!: string;
  @IsDateString() date!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateDayworkDto {
  @IsDateString() date!: string;
  @IsString() @MinLength(1) @MaxLength(2000) description!: string;
  @IsOptional() @IsNumber() @Min(0) labour?: number;
  @IsOptional() @IsNumber() @Min(0) plant?: number;
  @IsOptional() @IsNumber() @Min(0) materials?: number;
}

export class PriceIndexDto {
  @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(300) source?: string;
}

export class IndexValueDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' }) month!: string;
  @IsNumber() @Min(0.0001) value!: number;
}

export class IndexValuesDto {
  @IsArray() @ArrayMaxSize(600) @ValidateNested({ each: true }) @Type(() => IndexValueDto) values!: IndexValueDto[];
}

export class EscalationWeightDto {
  @IsUUID() indexId!: string;
  @IsNumber() @Min(0) @Max(1) weight!: number;
}

/** A contract's price adjustment; no weightings turns it off. */
export class ContractEscalationDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'baseMonth must be YYYY-MM' }) baseMonth?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) fixedPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(12) lagMonths?: number;
  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => EscalationWeightDto) weights!: EscalationWeightDto[];
}

export class MeasureReasonDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class UpdateValuationDto {
  @IsOptional() @IsDateString() valuationDate?: string;
  @IsOptional() @IsBoolean() isFinal?: boolean;
  @IsOptional() @IsNumber() @Min(0) materialsOnSite?: number;
  @IsOptional() @IsIn([0, 50, 100]) retentionReleasePct?: number;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ValuationLineDto) lines?: ValuationLineDto[];
}

export class ReturnValuationDto {
  @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}

/** The PM's signed decision on a valuation: approving issues the
 * certificate, rejecting returns it to the QS with the comment. */
export class CertifyValuationDto extends DecisionDto {
  @IsOptional() @IsDateString() responseDueAt?: string;
}

export class PayValuationDto {
  @IsString() @MinLength(1) @MaxLength(200) paymentReference!: string;
  @IsOptional() @IsDateString() paidAt?: string;
}
