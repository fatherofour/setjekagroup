import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { AdviceTopic, AgreementStatus, ContractForm, DeliveryStrategy, TenderMethod } from '../../generated/prisma/enums.js';

export class UpdateBriefDto {
  @IsOptional() @IsString() clientRequirements?: string | null;
  @IsOptional() @IsString() userNeeds?: string | null;
  @IsOptional() @IsString() optionsConsidered?: string | null;
  @IsOptional() @IsString() objectives?: string | null;
  @IsOptional() @IsString() priorities?: string | null;
  @IsOptional() @IsString() constraints?: string | null;
  @IsOptional() @IsString() assumptions?: string | null;
  @IsOptional() @IsString() aspirations?: string | null;
  @IsOptional() @IsString() strategies?: string | null;
  @IsOptional() @IsNumber() @Min(0) budgetTarget?: number | null;
  @IsOptional() @IsDateString() targetCompletion?: string | null;
}

export class UpdateProcurementPolicyDto {
  @IsOptional() @IsEnum(DeliveryStrategy) deliveryStrategy?: DeliveryStrategy | null;
  @IsOptional() @IsEnum(TenderMethod) tenderMethod?: TenderMethod | null;
  @IsOptional() @IsEnum(ContractForm) contractForm?: ContractForm | null;
  @IsOptional() @IsInt() @Min(1) @Max(20) minimumQuotes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) priceWeight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) ratingWeight?: number;
  @IsOptional() @IsString() preferentialProcurement?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) localContentTargetPct?: number | null;
  @IsOptional() @IsString() approvalThresholds?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class CreateAdviceDto {
  @IsEnum(AdviceTopic) topic!: AdviceTopic;
  @IsString() @MinLength(1) body!: string;
}

export class UpdateAppointmentTermsDto {
  @IsOptional() @IsString() scopeOfWork?: string | null;
  @IsOptional() @IsString() rolesAndResponsibilities?: string | null;
  @IsOptional() @IsString() feeBasis?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) feePercentage?: number | null;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number | null;
  @IsOptional() @IsString() agreementForm?: string | null;
  @IsOptional() @IsEnum(AgreementStatus) agreementStatus?: AgreementStatus;
  @IsOptional() @IsDateString() agreementSignedAt?: string | null;
}

export class MyAppointmentDto {
  @IsOptional() @IsString() scopeOfWork?: string | null;
  @IsOptional() @IsString() rolesAndResponsibilities?: string | null;
}

export class DeliverableActionDto {
  @IsOptional() @IsString() comment?: string;
}

export class DecideDeliverableDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() comment?: string;
}

export class ResponsibilityCheckDto {
  @IsOptional() @IsString() note?: string;
}

export class GenerateProgrammeDto {
  @IsOptional() @IsDateString() startDate?: string;
}
