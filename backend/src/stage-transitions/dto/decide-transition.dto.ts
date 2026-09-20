import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DecideTransitionDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
