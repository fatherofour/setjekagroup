import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { InterfaceType } from '../../generated/prisma/enums.js';

export class InterfaceDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsEnum(InterfaceType) type?: InterfaceType;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  /** The team member who provides it and gets the detail agreed. */
  @IsUUID() ownerId!: string;
  /** The team member who depends on it. */
  @IsUUID() accepterId!: string;
  @IsOptional() @IsDateString() needBy?: string;
  @IsOptional() @IsUUID() scheduleActivityId?: string;
  @IsOptional() @IsUUID() rfiId?: string;
}

export class ProposeInterfaceDto {
  @IsString() @MinLength(1) @MaxLength(8000) agreedDetail!: string;
}

export class SiteCommentDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}

export class SiteReasonDto {
  @IsString() @MinLength(1) @MaxLength(4000) reason!: string;
}

export class HiddenWorkDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(80) trade?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsUUID() contractorId?: string;
  @IsOptional() @IsUUID() scheduleActivityId?: string;
  /** Who is asked to inspect it. */
  @IsOptional() @IsUUID() inspectorId?: string;
  @IsOptional() @IsDateString() readyAt?: string;
  @IsOptional() @IsString() @MaxLength(8000) asBuilt?: string;
}

export class ApproveHiddenWorkDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
  /** The record of what is covered, if the inspector adds or corrects it. */
  @IsOptional() @IsString() @MaxLength(8000) asBuilt?: string;
}

export class RerequestHiddenWorkDto {
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
  @IsOptional() @IsDateString() readyAt?: string;
}
