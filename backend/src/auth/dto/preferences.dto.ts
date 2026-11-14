import { IsIn, IsOptional } from 'class-validator';

/** The date formats a person can choose (critique M-07). DD/MM/YYYY is the
 * default for South Africa and Nigeria. */
export const DATE_FORMATS = ['DD/MM/YYYY', 'DD MMM YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'] as const;

export class PreferencesDto {
  @IsOptional()
  @IsIn(DATE_FORMATS)
  dateFormat?: (typeof DATE_FORMATS)[number];
}
