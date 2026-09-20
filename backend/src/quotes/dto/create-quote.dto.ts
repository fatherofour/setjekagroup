import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class CreateQuoteDto {
  // Only required for an internal user recording a quote on a vendor's
  // behalf - an external CONTRACTOR-role caller has this forced to their
  // own membership's contractorId (see QuotesService.create).
  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsEnum(Currency)
  currency!: Currency;

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
