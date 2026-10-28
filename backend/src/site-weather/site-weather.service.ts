import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';

// Open-Meteo: free, no key, the same service the dashboard's live weather
// uses. The forecast API is used for the last two weeks only: its older
// past days come back partly empty. The archive API carries everything
// before that (complete up to yesterday).
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';
const RECENT_DAYS = 14;
const RUN_EVERY_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

interface Daily {
  time: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_sum?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Records each site's weather once a day for the life of the project (App
 * Review, 17 Oct 2026), so that "the weather two weeks ago" can be looked
 * up. There's no job scheduler in this app, so this runs on a timer inside
 * the API: on start-up, then every three hours. Each run fills any missing
 * days since the project started (or since recording last succeeded), so
 * downtime leaves no gaps. Recording stops once a project is completed or
 * archived. Turn it off with SITE_WEATHER_RECORDING=off. */
@Injectable()
export class SiteWeatherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(SiteWeatherService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SITE_WEATHER_RECORDING === 'off') return;
    // A little after start-up, so it never slows the API coming up.
    setTimeout(() => void this.recordAll(), 15_000).unref();
    this.timer = setInterval(() => void this.recordAll(), RUN_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async recordAll() {
    if (this.running) return;
    this.running = true;
    try {
      const projects = await this.prisma.project.findMany({
        where: { latitude: { not: null }, longitude: { not: null }, status: { notIn: ['COMPLETED', 'ARCHIVED'] } },
        select: { id: true, latitude: true, longitude: true, startDate: true, createdAt: true },
      });
      for (const p of projects) {
        try {
          await this.recordProject(p.id, p.latitude!, p.longitude!, p.startDate && p.startDate < p.createdAt ? p.startDate : p.createdAt);
        } catch (e) {
          this.log.warn(`Weather for project ${p.id} not recorded: ${(e as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Fills every day from `since` (or the last complete day on record) up
   * to today. Today is stored too, marked incomplete, and refreshed on
   * later runs until it's over. */
  async recordProject(projectId: string, latitude: number, longitude: number, since: Date) {
    const today = utcDay(isoDay(new Date()));
    const lastComplete = await this.prisma.siteWeatherDay.findFirst({
      where: { projectId, isComplete: true, latitude, longitude },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    let from = lastComplete ? new Date(lastComplete.date.getTime() + DAY_MS) : utcDay(isoDay(since));
    if (from > today) from = today;

    const recentStart = new Date(today.getTime() - (RECENT_DAYS - 1) * DAY_MS);
    const batches: Daily[] = [];
    if (from < recentStart) {
      batches.push(await this.fetch(ARCHIVE, latitude, longitude, `start_date=${isoDay(from)}&end_date=${isoDay(new Date(recentStart.getTime() - DAY_MS))}`));
    }
    const pastDays = Math.round((today.getTime() - Math.max(from.getTime(), recentStart.getTime())) / DAY_MS);
    batches.push(await this.fetch(FORECAST, latitude, longitude, `past_days=${pastDays}&forecast_days=1`));

    const todayIso = isoDay(today);
    for (const d of batches) {
      for (let i = 0; i < d.time.length; i++) {
        const day = d.time[i];
        if (day < isoDay(from) || day > todayIso) continue;
        const values = {
          weatherCode: d.weather_code?.[i] ?? null,
          tempMaxC: d.temperature_2m_max?.[i] ?? null,
          tempMinC: d.temperature_2m_min?.[i] ?? null,
          precipitationMm: d.precipitation_sum?.[i] ?? null,
          windMaxKmh: d.wind_speed_10m_max?.[i] ?? null,
          latitude,
          longitude,
          isComplete: day < todayIso,
        };
        // The archive can lag a few days behind; skip empty days so the next
        // run fills them in.
        if (values.weatherCode === null && values.tempMaxC === null) continue;
        await this.prisma.siteWeatherDay.upsert({
          where: { projectId_date: { projectId, date: utcDay(day) } },
          create: { projectId, date: utcDay(day), ...values },
          update: values,
        });
      }
    }
  }

  private async fetch(base: string, latitude: number, longitude: number, range: string): Promise<Daily> {
    const url = `${base}?latitude=${latitude}&longitude=${longitude}&daily=${DAILY}&timezone=auto&${range}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const body = (await res.json()) as { daily?: Daily };
    return body.daily ?? { time: [] };
  }

  async refresh(projectId: string, userId: string) {
    const p = await this.projects.findOneForOwner(projectId, userId);
    if (p.latitude != null && p.longitude != null && !['COMPLETED', 'ARCHIVED'].includes(p.status)) {
      await this.recordProject(p.id, p.latitude, p.longitude, p.startDate && p.startDate < p.createdAt ? p.startDate : p.createdAt);
    }
    return this.history(projectId, userId);
  }

  /** The recorded days for a project, newest first. */
  async history(projectId: string, userId: string, from?: string, to?: string) {
    const project = await this.projects.findOneForOwner(projectId, userId);
    const where = {
      projectId,
      date: {
        ...(from ? { gte: utcDay(from) } : {}),
        ...(to ? { lte: utcDay(to) } : {}),
      },
    };
    const days = await this.prisma.siteWeatherDay.findMany({ where, orderBy: { date: 'desc' }, take: from || to ? 1000 : 60 });
    const recording = project.latitude != null && project.longitude != null && !['COMPLETED', 'ARCHIVED'].includes(project.status);
    return { recording, hasLocation: project.latitude != null && project.longitude != null, days };
  }
}
