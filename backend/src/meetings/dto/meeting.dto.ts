import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MeetingStatus, MeetingType, SchedulePriority } from '../../generated/prisma/enums.js';

export class CreateMeetingDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsEnum(MeetingType) meetingType?: MeetingType;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) attendeeIds?: string[];
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsEnum(MeetingType) meetingType?: MeetingType;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsString() agenda?: string | null;
  @IsOptional() @IsString() minutes?: string | null;
  @IsOptional() @IsEnum(MeetingStatus) status?: MeetingStatus;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) attendeeIds?: string[];
}

export class AttendanceEntryDto {
  @IsUUID() projectMemberId!: string;
  @IsOptional() @IsBoolean() present?: boolean | null;
}

export class RecordAttendanceDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AttendanceEntryDto) entries!: AttendanceEntryDto[];
}

export class CreateActionItemDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(SchedulePriority) priority?: SchedulePriority;
}
