import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class RequestDecisionDto {
  @IsOptional() @IsString() comment?: string;
}

export class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() comment?: string;
}

export class MarkPaidDto {
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
}

export class CheckDto {
  @IsOptional() @IsString() note?: string;
}

export class UploadDocumentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() linkType?: string;
  @IsOptional() @IsString() linkId?: string;
}
