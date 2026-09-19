import { IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { OrganisationClassification } from '../../generated/prisma/enums.js';

export class CreateContractorDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  tradingName?: string;

  @IsOptional()
  @IsString()
  tradeType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disciplines?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(OrganisationClassification, { each: true })
  classifications?: OrganisationClassification[];

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxVatNumber?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  stateProvince?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsInt()
  yearEstablished?: number;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  website?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
