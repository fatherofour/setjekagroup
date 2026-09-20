import { IsEnum } from 'class-validator';
import { DocumentRevisionStatus } from '../../generated/prisma/enums.js';

export class ReviewRevisionDto {
  @IsEnum(DocumentRevisionStatus)
  reviewStatus!: DocumentRevisionStatus;
}
