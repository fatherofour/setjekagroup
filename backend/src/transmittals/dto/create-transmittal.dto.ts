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

  /** Everyone on these distribution lists is added as a recipient. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  distributionListIds?: string[];
}
