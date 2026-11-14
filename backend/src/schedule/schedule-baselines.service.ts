import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { workingDaysBetween } from './schedule-cpm.util.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateBaselineDto } from './dto/create-baseline.dto.js';
import { scheduleVisibility } from './schedule-visibility.js';

const BASELINE_INCLUDE = { snapshots: true } as const;

@Injectable()
export class ScheduleBaselinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.scheduleBaseline.findMany({ where: { projectId }, include: BASELINE_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(projectId: string, ownerId: string, dto: CreateBaselineDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const activities = await this.prisma.scheduleActivity.findMany({ where: { projectId } });

    return this.prisma.scheduleBaseline.create({
      data: {
        projectId,
        name: dto.name,
        createdById: ownerId,
        snapshots: {
          create: activities.map((a) => ({
            activityId: a.id,
            baselineStart: a.startDate,
            baselineEnd: a.endDate,
            baselineDurationDays: a.durationDays,
            baselinePercent: a.percentComplete,
            wasCritical: a.isCriticalPath,
            baselineFloatDays: a.totalFloatDays,
          })),
        },
      },
      include: BASELINE_INCLUDE,
    });
  }

  /** The programme against a baseline (the latest unless one is named):
   * each activity's start and finish movement in working days, where its
   * progress stands against where the baseline has it today, critical path
   * changes, and the forecast finish against the baselined one. */
  async variance(projectId: string, ownerId: string, baselineId?: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const list = await this.prisma.scheduleBaseline.findMany({ where: { projectId }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    const chosen = baselineId ? list.find((b) => b.id === baselineId) : list[0];
    if (baselineId && !chosen) throw new NotFoundException('Baseline not found');
    if (!chosen) return { baselines: list, baseline: null, summary: null, activities: [] };
    const [snapshots, activities] = await Promise.all([
      this.prisma.scheduleBaselineSnapshot.findMany({ where: { baselineId: chosen.id } }),
      this.prisma.scheduleActivity.findMany({
        where: { projectId },
        select: { id: true, name: true, parentId: true, activityType: true, startDate: true, endDate: true, durationDays: true, percentComplete: true, status: true, isCriticalPath: true, totalFloatDays: true, contractor: { select: { name: true } } },
        orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
      }),
    ]);
    const snap = new Map(snapshots.map((x) => [x.activityId, x]));
    const parents = new Set(activities.flatMap((a) => (a.parentId ? [a.parentId] : [])));
    const today = day(new Date());
    const rows = activities.map((a) => {
      const s = snap.get(a.id);
      const leaf = !parents.has(a.id);
      if (!s) {
        return { ...a, leaf, isNew: true, baseline: null, startVarianceDays: null, finishVarianceDays: null, durationVarianceDays: null, plannedPercent: null, progressGap: null, flag: 'NEW' as const, behind: false, critical: a.isCriticalPath ? ('CRITICAL' as const) : null };
      }
      const finishVarianceDays = workingDaysBetween(day(s.baselineEnd), day(a.endDate));
      const plannedPercent = plannedAt(s, today);
      const progressGap = a.percentComplete - plannedPercent;
      const done = a.status === 'COMPLETED' || a.percentComplete >= 100;
      return {
        ...a,
        leaf,
        isNew: false,
        baseline: { start: s.baselineStart, end: s.baselineEnd, durationDays: s.baselineDurationDays, wasCritical: s.wasCritical },
        startVarianceDays: workingDaysBetween(day(s.baselineStart), day(a.startDate)),
        finishVarianceDays,
        durationVarianceDays: a.durationDays - s.baselineDurationDays,
        plannedPercent,
        progressGap,
        flag: finishVarianceDays > 0 ? ('SLIPPED' as const) : finishVarianceDays < 0 ? ('AHEAD' as const) : ('ON_PLAN' as const),
        behind: leaf && !done && progressGap <= -10,
        critical: a.isCriticalPath && !s.wasCritical ? ('NOW_CRITICAL' as const) : !a.isCriticalPath && s.wasCritical ? ('OFF_CRITICAL' as const) : a.isCriticalPath ? ('CRITICAL' as const) : null,
      };
    });
    const based = rows.filter((r) => !r.isNew && r.leaf);
    const maxOf = (ds: Date[]) => (ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : null);
    const minOf = (ds: Date[]) => (ds.length ? new Date(Math.min(...ds.map((d) => d.getTime()))) : null);
    const baselineFinish = maxOf(snapshots.map((x) => x.baselineEnd));
    const forecastFinish = maxOf(activities.map((a) => a.endDate));
    // Progress weighted by duration, over the activities that do the work.
    const weight = (r: { durationDays: number }) => Math.max(r.durationDays, 1);
    const total = based.reduce((t, r) => t + weight(r), 0);
    const pct = (f: (r: (typeof based)[number]) => number) => (total ? Math.round(based.reduce((t, r) => t + weight(r) * f(r), 0) / total) : 0);
    return {
      baselines: list,
      baseline: { ...chosen, start: minOf(snapshots.map((x) => x.baselineStart)), finish: baselineFinish },
      summary: {
        forecastFinish,
        finishVarianceDays: baselineFinish && forecastFinish ? workingDaysBetween(day(baselineFinish), day(forecastFinish)) : 0,
        plannedPercent: pct((r) => r.plannedPercent ?? 0),
        actualPercent: pct((r) => r.percentComplete),
        slipped: based.filter((r) => r.flag === 'SLIPPED').length,
        slippedCritical: based.filter((r) => r.flag === 'SLIPPED' && r.isCriticalPath).length,
        ahead: based.filter((r) => r.flag === 'AHEAD').length,
        onPlan: based.filter((r) => r.flag === 'ON_PLAN').length,
        behind: based.filter((r) => r.behind).length,
        nowCritical: rows.filter((r) => r.critical === 'NOW_CRITICAL').length,
        offCritical: rows.filter((r) => r.critical === 'OFF_CRITICAL').length,
        added: rows.filter((r) => r.isNew).length,
      },
      // A contractor: only their own and linked activities (critique M-02).
      activities: await (async () => {
        const vis = await scheduleVisibility(this.prisma, projectId, ownerId);
        return vis ? rows.filter((r) => vis.ids.has(r.id)) : rows;
      })(),
    };
  }

  async remove(projectId: string, ownerId: string, baselineId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const existing = await this.prisma.scheduleBaseline.findFirst({ where: { id: baselineId, projectId } });
    if (!existing) throw new NotFoundException('Baseline not found');
    await this.prisma.scheduleBaseline.delete({ where: { id: baselineId } });
  }
}

/** Midnight UTC of the day, as the programme keeps its dates. */
function day(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** How far the baseline has an activity by `today`, in %: straight-line
 * over its working days (inclusive of today), a milestone all or nothing. */
function plannedAt(s: { baselineStart: Date; baselineEnd: Date; baselineDurationDays: number }, today: Date) {
  const start = day(s.baselineStart);
  const end = day(s.baselineEnd);
  if (s.baselineDurationDays <= 0) return today >= end ? 100 : 0;
  if (today < start) return 0;
  if (today >= end) return 100;
  return Math.min(100, Math.round(((workingDaysBetween(start, today) + 1) / s.baselineDurationDays) * 100));
}
