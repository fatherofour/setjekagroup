import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
}
