import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRfqItemDto {
  /** Link to a cost-database resource so the awarded rate can update that
   * resource's price in the RFQ's region. Unit and description follow it. */
  @IsOptional() @IsUUID() resourceId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) unit?: string;
  @IsNumber() @Min(0) quantity!: number;
}

export class UpdateRfqItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) description?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
}

export class AwardRfqQuoteDto {
  @IsUUID() quoteId!: string;
}
