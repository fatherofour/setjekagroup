import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { OrganisationProjectRole, OrganisationAppointmentStatus, Currency } from '../../generated/prisma/enums.js';

export class UpdateAppointmentDto {
  @IsOptional()
  @IsEnum(OrganisationProjectRole)
  role?: OrganisationProjectRole;

  @IsOptional()
  @IsString()
  appointmentType?: string;

  @IsOptional()
  @IsDateString()
  appointmentDate?: string;

  @IsOptional()
  @IsString()
  appointmentReference?: string;

  @IsOptional()
  @IsString()
  contractReference?: string;

  @IsOptional()
  @IsNumber()
  contractValue?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  scopeOfWork?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(OrganisationAppointmentStatus)
  appointmentStatus?: OrganisationAppointmentStatus;
}
