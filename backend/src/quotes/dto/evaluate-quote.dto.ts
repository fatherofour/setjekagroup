import { IsArray, IsNumber, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class EvaluationCriterionDto {
  @IsString()
  @MinLength(1)
  criterion!: string;

  @IsNumber()
  weight!: number;

  @IsNumber()
  score!: number;
}

export class EvaluateQuoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionDto)
  scores!: EvaluationCriterionDto[];
}
