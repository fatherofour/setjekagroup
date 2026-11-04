import type { Country, Currency } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** What changes with the country a project is in (2026-11-04: Setjeka
 * works across Africa, mainly South Africa and Nigeria). Each project
 * carries its country; South Africa is the default, as the business is
 * registered there and the data is kept there. The incident and permit
 * rules are starting points for each country's HSE consultant to confirm. */
export interface CountryRules {
  name: string;
  /** Hours ahead of UTC; neither country keeps daylight saving. */
  utcOffsetHours: number;
  timeZone: string;
  currency: Currency;
  incidents: {
    /** Who a reportable incident goes to. */
    authority: string;
    /** The short form, for labels: "Reported to the Department". */
    short: string;
    law: string;
    /** Days off work beyond which an injury is reportable. */
    lostDaysOver: number;
    /** The rule in a sentence, for the screens and the guide. */
    rule: string;
  };
  /** Cite the South African regulations on permit precautions. */
  citeSaRegulations: boolean;
}

export const COUNTRIES: Record<Country, CountryRules> = {
  ZA: {
    name: 'South Africa',
    utcOffsetHours: 2,
    timeZone: 'Africa/Johannesburg',
    currency: 'ZAR',
    incidents: {
      authority: 'the Department of Employment and Labour',
      short: 'the Department',
      law: 'OHS Act section 24',
      lostDaysOver: 14,
      rule: 'Deaths, injuries that keep someone off work for more than 14 days, and dangerous occurrences are reportable to the Department of Employment and Labour under the OHS Act (section 24).',
    },
    citeSaRegulations: true,
  },
  NG: {
    name: 'Nigeria',
    utcOffsetHours: 1,
    timeZone: 'Africa/Lagos',
    currency: 'NGN',
    incidents: {
      authority: 'the Federal Ministry of Labour and Employment',
      short: 'the Ministry of Labour',
      law: 'Factories Act section 51',
      lostDaysOver: 3,
      rule: 'Deaths, injuries that keep someone off work for more than 3 days, and dangerous occurrences are reportable to the Federal Ministry of Labour and Employment under the Factories Act (section 51). Injuries also go to the NSITF within 7 days (Employee’s Compensation Act), and on Lagos projects to the Lagos State Safety Commission.',
    },
    citeSaRegulations: false,
  },
};

export const rulesFor = (country: Country | null | undefined) => COUNTRIES[country ?? 'ZA'];

export async function projectCountry(prisma: PrismaService, projectId: string): Promise<Country> {
  return (await prisma.project.findUnique({ where: { id: projectId }, select: { country: true } }))?.country ?? 'ZA';
}

/** Today on site, as YYYY-MM-DD, in the project's country. */
export function siteToday(country: Country | null | undefined, now = Date.now()) {
  return new Date(now + rulesFor(country).utcOffsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** The calendar day on site a moment falls on, as a day number since 1970,
 * so a notice late in the evening isn't rounded into the next day. */
export function siteDayNumber(country: Country | null | undefined, d: Date) {
  return Math.floor((d.getTime() + rulesFor(country).utcOffsetHours * 3_600_000) / 86_400_000);
}
