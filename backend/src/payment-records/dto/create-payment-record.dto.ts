import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class CreatePaymentRecordDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
