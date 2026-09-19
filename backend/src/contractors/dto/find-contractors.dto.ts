import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  OrganisationClassification,
  OrganisationRegistrationStatus,
  OrganisationPrequalificationStatus,
} from '../../generated/prisma/enums.js';

export class FindContractorsDto {
  @IsOptional()
  @IsEnum(OrganisationClassification)
  classification?: OrganisationClassification;

  @IsOptional()
  @IsString()
  discipline?: string;

  @IsOptional()
  @IsEnum(OrganisationRegistrationStatus)
  registrationStatus?: OrganisationRegistrationStatus;

  @IsOptional()
  @IsEnum(OrganisationPrequalificationStatus)
  prequalificationStatus?: OrganisationPrequalificationStatus;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
