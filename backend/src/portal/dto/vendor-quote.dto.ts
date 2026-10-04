import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { QuoteItemRateDto } from '../../rfqs/quote-items.js';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class VendorQuoteDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  technicalProposal?: string;

  @IsOptional()
  @IsString()
  commercialTerms?: string;

  // Unit rate per RFQ item, when the RFQ is priced item by item; the
  // quote's price is then their extended total.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemRateDto)
  items?: QuoteItemRateDto[];
}
