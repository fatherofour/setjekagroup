import { IsEnum } from 'class-validator';
import { UserStatus } from '../../generated/prisma/enums.js';

export class SetUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
