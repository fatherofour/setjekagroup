import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { ProjectMemberRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { SaveDiaryDto } from './dto/site-diary.dto.js';

const WRITERS: ProjectMemberRole[] = ['SITE_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'];
const INCLUDE = { author: { select: { fullName: true } }, signedBy: { select: { fullName: true } } } satisfies Prisma.SiteDiaryInclude;
type Labour = { party: string; trade?: string; count: number };
type Plant = { description: string; count: number; state: string };

/** The day on site, as South Africa (UTC+2) has it, as a date-only value. */
export function siteDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Give the day as YYYY-MM-DD');
  return new Date(`${value}T00:00:00.000Z`);
}
const todaySa = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const headcount = (labour: unknown) => ((labour as Labour[]) ?? []).reduce((n, l) => n + (l.count ?? 0), 0);

/** The daily site diary (the site manager's items, 2026-11-04). The site
 * manager, Setjeka's PM or DM, or Setjeka writes one per day; the site
 * team and the consultants read it; the client does not. A new day starts
 * from the last day's labour and plant, with the weather recorded on site.
 * Signed, a day is locked; later notes go in its thread. */
@Injectable()
export class SiteDiaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    if (!internal && !roles.some((r) => r !== 'CLIENT')) throw new NotFoundException('Not found');
    return { writer: internal || roles.some((r) => WRITERS.includes(r)) };
  }

  private async weather(projectId: string, date: Date) {
    const w = await this.prisma.siteWeatherDay.findFirst({ where: { projectId, date }, select: { tempMaxC: true, tempMinC: true, precipitationMm: true, windMaxKmh: true } });
    return w ?? null;
  }

  async list(projectId: string, userId: string, from?: string, to?: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.siteDiary.findMany({
      where: { projectId, ...(from || to ? { date: { ...(from ? { gte: siteDate(from) } : {}), ...(to ? { lte: siteDate(to) } : {}) } } : {}) },
      orderBy: { date: 'desc' },
      take: 120,
      select: { id: true, date: true, status: true, labour: true, delays: true, workingHours: true, author: { select: { fullName: true } } },
    });
    return {
      today: todaySa(),
      canWrite: w.writer,
      days: rows.map((r) => ({ id: r.id, date: r.date, status: r.status, headcount: headcount(r.labour), manHours: headcount(r.labour) * r.workingHours, hasDelays: Boolean(r.delays?.trim()), author: r.author.fullName })),
    };
  }

  /** One day: the diary if written, or a fresh page started from the last
   * day's labour and plant. */
  async day(projectId: string, userId: string, dateStr: string) {
    const w = await this.who(projectId, userId);
    const date = siteDate(dateStr);
    const [entry, weather] = await Promise.all([this.prisma.siteDiary.findUnique({ where: { projectId_date: { projectId, date } }, include: INCLUDE }), this.weather(projectId, date)]);
    if (entry) return { ...entry, exists: true, weather, headcount: headcount(entry.labour), can: { edit: w.writer && entry.status === 'DRAFT', sign: w.writer && entry.status === 'DRAFT' } };
    const last = await this.prisma.siteDiary.findFirst({ where: { projectId, date: { lt: date } }, orderBy: { date: 'desc' }, select: { labour: true, plant: true, workingHours: true, date: true } });
    return {
      exists: false,
      date,
      status: 'DRAFT',
      workingHours: last?.workingHours ?? 9,
      labour: last?.labour ?? [],
      plant: last?.plant ?? [],
      carriedFrom: last?.date ?? null,
      weather,
      headcount: headcount(last?.labour),
      can: { edit: w.writer && dateStr <= todaySa(), sign: false },
    };
  }

  async save(projectId: string, userId: string, dateStr: string, dto: SaveDiaryDto) {
    const w = await this.who(projectId, userId);
    if (!w.writer) throw new ForbiddenException('The site manager, Setjeka’s PM or DM, or Setjeka keeps the diary');
    if (dateStr > todaySa()) throw new BadRequestException('A diary is kept for a day that has begun');
    const date = siteDate(dateStr);
    const existing = await this.prisma.siteDiary.findUnique({ where: { projectId_date: { projectId, date } } });
    if (existing?.status === 'SIGNED') throw new BadRequestException('This day is signed; add anything further as a note on it');
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    const data = {
      workingHours: dto.workingHours,
      weatherNote: clean(dto.weatherNote),
      labour: dto.labour ? (dto.labour.filter((l) => l.party.trim()).map((l) => ({ party: l.party.trim(), trade: l.trade?.trim() || undefined, count: l.count })) as Prisma.InputJsonValue) : undefined,
      plant: dto.plant ? (dto.plant.filter((p) => p.description.trim()).map((p) => ({ description: p.description.trim(), count: p.count, state: p.state })) as Prisma.InputJsonValue) : undefined,
      visitors: clean(dto.visitors),
      deliveries: clean(dto.deliveries),
      delays: clean(dto.delays),
      instructions: clean(dto.instructions),
      safety: clean(dto.safety),
      notes: clean(dto.notes),
    };
    if (existing) await this.prisma.siteDiary.update({ where: { id: existing.id }, data });
    else {
      // A new day starts from the last day's labour and plant unless given.
      const last = await this.prisma.siteDiary.findFirst({ where: { projectId, date: { lt: date } }, orderBy: { date: 'desc' }, select: { labour: true, plant: true, workingHours: true } });
      await this.prisma.siteDiary.create({ data: { projectId, date, authorId: userId, ...data, labour: data.labour ?? (last?.labour as Prisma.InputJsonValue) ?? [], plant: data.plant ?? (last?.plant as Prisma.InputJsonValue) ?? [], workingHours: data.workingHours ?? last?.workingHours ?? 9 } });
    }
    return this.day(projectId, userId, dateStr);
  }

  async sign(projectId: string, userId: string, dateStr: string) {
    const w = await this.who(projectId, userId);
    if (!w.writer) throw new ForbiddenException('The site manager, Setjeka’s PM or DM, or Setjeka signs the diary');
    const entry = await this.prisma.siteDiary.findUnique({ where: { projectId_date: { projectId, date: siteDate(dateStr) } } });
    if (!entry) throw new BadRequestException('Write the day first');
    if (entry.status === 'SIGNED') throw new BadRequestException('This day is already signed');
    if (!headcount(entry.labour) && !entry.notes && !entry.delays) throw new BadRequestException('Record who was on site, or a note on why nobody was, before signing');
    await this.prisma.siteDiary.update({ where: { id: entry.id }, data: { status: 'SIGNED', signedAt: new Date(), signedById: userId } });
    return this.day(projectId, userId, dateStr);
  }
}

/** Hours worked on site from the signed diaries: people on site times the
 * working day. */
export async function diaryManHours(prisma: PrismaService, projectId: string) {
  const rows = await prisma.siteDiary.findMany({ where: { projectId, status: 'SIGNED' }, select: { labour: true, workingHours: true } });
  return rows.reduce((h, r) => h + headcount(r.labour) * r.workingHours, 0);
}

/** The diary over a period, for a delay claim: days recorded, and the days
 * that note a delay. */
export async function diaryOver(prisma: PrismaService, projectId: string, from: Date, to: Date) {
  const rows = await prisma.siteDiary.findMany({
    where: { projectId, status: 'SIGNED', date: { gte: new Date(from.toISOString().slice(0, 10)), lte: new Date(to.toISOString().slice(0, 10)) } },
    select: { date: true, delays: true },
    orderBy: { date: 'asc' },
  });
  const withDelays = rows.filter((r) => r.delays?.trim());
  return { days: rows.length, delayDays: withDelays.length, delays: withDelays.slice(0, 20).map((r) => ({ date: r.date, delays: r.delays })) };
}
