import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class CreateOpportunityRfqDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  discipline!: string;

  @IsOptional()
  @IsString()
  scopeDescription?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priceWeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  ratingWeight?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  contractorIds!: string[];

  @IsOptional()
  @IsBoolean()
  issue?: boolean;
}

export class UpdateOpportunityRfqDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  scopeDescription?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priceWeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  ratingWeight?: number;
}

export class InviteConsultantDto {
  @IsUUID()
  contractorId!: string;
}

export class RecordOpportunityQuoteDto {
  @IsUUID()
  contractorId!: string;

  @IsNumber()
  @IsPositive()
  price!: number;

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
}

export class AwardRfqDto {
  @IsUUID()
  quoteId!: string;

  @IsOptional()
  @IsString()
  justification?: string;
}
