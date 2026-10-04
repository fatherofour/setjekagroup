import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { VariationReason } from '../../generated/prisma/enums.js';

export class UpdateBudgetDto {
  @IsOptional() @IsNumber() @Min(0) contingencyAmount?: number;
  @IsOptional() @IsString() notes?: string | null;
}

export class BudgetLineDto {
  @IsUUID() costCodeId!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateBudgetLineDto {
  @IsOptional() @IsUUID() costCodeId?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class CreateVariationDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(VariationReason) reason?: VariationReason;
  @IsOptional() @IsUUID() rfiId?: string;
  @IsOptional() @IsUUID() costCodeId?: string;
  /** Negative for an omission. */
  @IsNumber() estimatedValue!: number;
  @IsOptional() @IsInt() @Min(-3650) @Max(3650) timeImpactDays?: number;
}

export class UpdateVariationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsEnum(VariationReason) reason?: VariationReason;
  @IsOptional() @IsUUID() rfiId?: string | null;
  @IsOptional() @IsUUID() costCodeId?: string | null;
  @IsOptional() @IsNumber() estimatedValue?: number;
  @IsOptional() @IsInt() @Min(-3650) @Max(3650) timeImpactDays?: number | null;
}

/** The QS's assessment of the variation's value. */
export class AssessVariationDto {
  @IsNumber() assessedValue!: number;
  @IsOptional() @IsString() comment?: string;
}

export class VariationActionDto {
  @IsOptional() @IsString() comment?: string;
}

export class DecideVariationDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() comment?: string;
}

export class CreateInvoiceDto {
  @IsUUID() purchaseOrderId!: string;
  @IsString() @MinLength(1) @MaxLength(80) invoiceNumber!: string;
  @IsDateString() invoiceDate!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) invoiceNumber?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() notes?: string | null;
}

export class PayInvoiceDto {
  @IsString() @MinLength(1) @MaxLength(120) paymentReference!: string;
  @IsOptional() @IsDateString() paidAt?: string;
}

export class RejectInvoiceDto {
  @IsString() @MinLength(1) reason!: string;
}
