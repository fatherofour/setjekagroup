import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTransmittalDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsUUID()
  fromMemberId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  recipientMemberIds?: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  documentRevisionIds!: string[];
}
