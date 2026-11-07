import { IsString, MaxLength, MinLength } from 'class-validator';
import { DecisionDto } from '../../signoff/dto/decision.dto.js';

export class DecideTransitionDto extends DecisionDto {}

export class AdvanceTransitionDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}
