import { IsUUID } from 'class-validator';

export class InviteVendorDto {
  @IsUUID()
  contractorId!: string;
}
