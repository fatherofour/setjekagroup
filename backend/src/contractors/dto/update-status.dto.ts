import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrganisationRegistrationStatus, OrganisationPrequalificationStatus } from '../../generated/prisma/enums.js';

export class UpdateStatusDto {
  @IsOptional()
  @IsEnum(OrganisationRegistrationStatus)
  registrationStatus?: OrganisationRegistrationStatus;

  @IsOptional()
  @IsEnum(OrganisationPrequalificationStatus)
  prequalificationStatus?: OrganisationPrequalificationStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
