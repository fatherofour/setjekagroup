import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ComplianceVerificationStatus } from '../../generated/prisma/enums.js';

export class CreateComplianceRecordDto {
  @IsString()
  @MinLength(1)
  documentType!: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  issuingAuthority?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsEnum(ComplianceVerificationStatus)
  verificationStatus?: ComplianceVerificationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
