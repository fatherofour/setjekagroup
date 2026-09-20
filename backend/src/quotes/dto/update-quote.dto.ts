import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class UpdateQuoteDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  warrantyTerms?: string;

  @IsOptional()
  @IsString()
  commercialTerms?: string;

  @IsOptional()
  @IsString()
  technicalProposal?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}
