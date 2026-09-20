import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { DeliveryStatus } from '../../generated/prisma/enums.js';

export class UpdateDeliveryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityOrdered?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityDelivered?: number;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsDateString()
  deliveredDate?: string;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @IsOptional()
  @IsUUID()
  acceptedById?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
