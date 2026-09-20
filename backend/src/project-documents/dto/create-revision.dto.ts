import { IsOptional, IsString } from 'class-validator';

export class CreateRevisionDto {
  @IsOptional()
  @IsString()
  revisionNumber?: string;
}
