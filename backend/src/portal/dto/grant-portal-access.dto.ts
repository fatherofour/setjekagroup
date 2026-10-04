import { IsEmail, IsString, MinLength } from 'class-validator';

export class GrantPortalAccessDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;
}
