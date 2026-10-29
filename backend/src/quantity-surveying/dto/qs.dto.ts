import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionLimitPct?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() completionDate?: string;
}

export class UpdateContractDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(ContractForm) contractForm?: ContractForm | null;
  @IsOptional() @IsNumber() @Min(0) contractSum?: number;
  @IsOptional() @IsUUID() costPlanId?: string | null;
  @IsOptional() @IsIn(CONTRACT_REVIEWERS) reviewerRole?: ProjectMemberRole;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) retentionLimitPct?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() completionDate?: string | null;
}

export class ContractFromAwardDto {
  @IsUUID() rfqId!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(ContractForm) contractForm?: ContractForm;
  @IsOptional() @IsIn(CONTRACT_REVIEWERS) reviewerRole?: ProjectMemberRole;
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
  @IsNumber() @Min(0) @Max(100) percentComplete!: number;
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
