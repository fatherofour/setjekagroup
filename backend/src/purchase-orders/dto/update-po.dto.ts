import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  costCode?: string;

  @IsOptional()
  @IsString()
  scopeDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  // The standard cost code the order is committed against (cost report).
  @IsOptional()
  @IsUUID()
  budgetCodeId?: string;
}
