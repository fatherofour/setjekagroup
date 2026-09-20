import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber()
  @Min(0)
  quantityOrdered!: number;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsUUID()
  acceptedById?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
