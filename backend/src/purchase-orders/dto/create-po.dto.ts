import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class CreatePurchaseOrderDto {
  @IsUUID()
  contractorId!: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  costCode?: string;

  @IsOptional()
  @IsString()
  scopeDescription?: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsEnum(Currency)
  currency!: Currency;
}
