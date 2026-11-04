import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProjectMemberRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ScheduleService } from '../schedule/schedule.service.js';
import { workingDaysBetween } from '../schedule/schedule-cpm.util.js';
import { unreleasedHolds } from '../quality-tests/quality-tests.service.js';

const DAY = 86_400_000;
const UPDATERS: ProjectMemberRole[] = ['SITE_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER', 'PLANNER_SCHEDULER'];
const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const todaySa = () => day(new Date(Date.now() + 2 * 3_600_000));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Where the programme has an activity by today, straight-line over its
 * working days. */
function plannedToday(start: Date, end: Date, durationDays: number, today: Date) {
  if (durationDays <= 0) return today >= day(end) ? 100 : 0;
  if (today < day(start)) return 0;
  if (today >= day(end)) return 100;
  return Math.min(100, Math.round(((workingDaysBetween(day(start), today) + 1) / durationDays) * 100));
}

/** The look-ahead and progress on site (the site manager's items,
 * 2026-11-04). The programme's next few weeks, week by week, with anything
 * already late first. The site manager, Setjeka's PM, DM or planner, or
 * Setjeka records progress on any activity, a contractor on their own; each
 * update is kept as a dated entry and moves the activity's % complete
 * through the programme, so hold points still hold. */
@Injectable()
export class LookAheadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly schedule: ScheduleService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    if (!internal && !roles.some((r) => r !== 'CLIENT')) throw new NotFoundException('Not found');
    return {
      updater: internal || roles.some((r) => UPDATERS.includes(r)),
      contractorIds: new Set(members.flatMap((m) => (roles.includes('CONTRACTOR') && m.contractorId ? [m.contractorId] : []))),
    };
  }

  private canUpdate(w: Awaited<ReturnType<LookAheadService['who']>>, contractorId: string | null) {
    return w.updater || Boolean(contractorId && w.contractorIds.has(contractorId));
  }

  async lookAhead(projectId: string, userId: string, weeks = 3) {
    const w = await this.who(projectId, userId);
    const span = Math.min(Math.max(Math.round(weeks) || 3, 1), 6);
    const today = todaySa();
    // Weeks run Monday to Sunday, starting this week.
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
    const horizon = new Date(monday.getTime() + span * 7 * DAY - DAY);
    const [activities, parents] = await Promise.all([
      this.prisma.scheduleActivity.findMany({
        where: { projectId, percentComplete: { lt: 100 }, startDate: { lte: horizon } },
        select: {
          id: true,
          name: true,
          activityType: true,
          startDate: true,
          endDate: true,
          durationDays: true,
          percentComplete: true,
          isCriticalPath: true,
          contractorId: true,
          contractor: { select: { name: true } },
          progressEntries: { orderBy: { createdAt: 'desc' }, take: 1, select: { date: true, percentComplete: true, note: true, recordedBy: { select: { fullName: true } } } },
        },
        orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.scheduleActivity.findMany({ where: { projectId, children: { some: {} } }, select: { id: true } }),
    ]);
    const summary = new Set(parents.map((p) => p.id));
    const holds = await Promise.all(activities.map((a) => unreleasedHolds(this.prisma, a.id)));
    const rows = activities
      .map((a, i) => ({ a, holds: holds[i] }))
      .filter(({ a }) => !summary.has(a.id))
      .map(({ a, holds: h }) => {
        const planned = plannedToday(a.startDate, a.endDate, a.durationDays, today);
        const late = day(a.endDate) < today;
        return {
          id: a.id,
          name: a.name,
          milestone: a.activityType === 'MILESTONE',
          startDate: a.startDate,
          endDate: a.endDate,
          percentComplete: a.percentComplete,
          plannedPercent: planned,
          behind: a.percentComplete + 10 <= planned,
          late,
          critical: a.isCriticalPath,
          contractor: a.contractor?.name ?? null,
          heldBy: h.map((x) => `${x.number} ${x.title}`),
          lastUpdate: a.progressEntries[0] ?? null,
          canUpdate: this.canUpdate(w, a.contractorId),
        };
      });
    const weekRows = Array.from({ length: span }, (_, k) => {
      const start = new Date(monday.getTime() + k * 7 * DAY);
      const end = new Date(start.getTime() + 6 * DAY);
      return { start: iso(start), end: iso(end), activities: rows.filter((r) => !r.late && day(r.startDate) <= end && day(r.endDate) >= start) };
    });
    return {
      today: iso(today),
      weeks: span,
      overdue: rows.filter((r) => r.late),
      byWeek: weekRows,
      counts: { inView: rows.length, overdue: rows.filter((r) => r.late).length, behind: rows.filter((r) => r.behind).length, held: rows.filter((r) => r.heldBy.length).length },
    };
  }

  async record(projectId: string, userId: string, activityId: string, percent: number, note?: string) {
    const w = await this.who(projectId, userId);
    const a = await this.prisma.scheduleActivity.findFirst({ where: { id: activityId, projectId }, select: { id: true, percentComplete: true, contractorId: true, name: true } });
    if (!a) throw new NotFoundException('Activity not found');
    if (!this.canUpdate(w, a.contractorId)) throw new ForbiddenException('The site manager, Setjeka or the contractor doing the work records its progress');
    if (percent === a.percentComplete) throw new BadRequestException(`${a.name} is already at ${percent}%`);
    if (percent < a.percentComplete && !note?.trim()) throw new BadRequestException('Say why the progress is going down');
    // Through the programme, so hold points stop progress and the dates and
    // critical path are worked out again.
    await this.schedule.updateActivity(projectId, userId, activityId, { percentComplete: percent, status: percent >= 100 ? 'COMPLETED' : percent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED' });
    await this.prisma.scheduleProgressEntry.create({ data: { projectId, activityId, date: todaySa(), percentComplete: percent, previousPercent: a.percentComplete, note: note?.trim() || null, recordedById: userId } });
    return this.history(projectId, userId, activityId);
  }

  async history(projectId: string, userId: string, activityId: string) {
    await this.who(projectId, userId);
    const a = await this.prisma.scheduleActivity.findFirst({ where: { id: activityId, projectId }, select: { id: true, name: true, percentComplete: true } });
    if (!a) throw new NotFoundException('Activity not found');
    const entries = await this.prisma.scheduleProgressEntry.findMany({ where: { activityId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, date: true, percentComplete: true, previousPercent: true, note: true, recordedBy: { select: { fullName: true } } } });
    return { ...a, entries };
  }
}

/** Progress recorded on a day, for the site diary. */
export async function progressOn(prisma: PrismaService, projectId: string, date: Date) {
  return prisma.scheduleProgressEntry.findMany({
    where: { projectId, date },
    orderBy: { createdAt: 'asc' },
    select: { percentComplete: true, previousPercent: true, note: true, activity: { select: { name: true } }, recordedBy: { select: { fullName: true } } },
  });
}
