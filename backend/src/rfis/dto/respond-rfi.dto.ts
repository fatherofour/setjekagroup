import { IsString, MinLength } from 'class-validator';

export class RespondRfiDto {
  @IsString()
  @MinLength(1)
  officialResponse!: string;
}
