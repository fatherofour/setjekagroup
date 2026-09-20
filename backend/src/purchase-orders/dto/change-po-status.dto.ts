import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PurchaseOrderStatus } from '../../generated/prisma/enums.js';

export class ChangePurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status!: PurchaseOrderStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
