import { ForbiddenException, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Currency } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommercialService } from '../commercial/commercial.service.js';
import { CostDatabaseService } from '../cost-database/cost-database.service.js';
import { ScheduleBaselinesService } from '../schedule/schedule-baselines.service.js';
import { addDays } from '../common/contract-forms.js';
import { HIGH_SEVERITY_THRESHOLD } from '../project-risks/project-risks.service.js';
import { openSeriousIncidents } from '../hse/hse.service.js';
import { expiredOpenPermits } from '../permits/permits.service.js';

export type Health = 'GREEN' | 'AMBER' | 'RED' | 'NONE';
const RANK: Record<Health, number> = { NONE: 0, GREEN: 1, AMBER: 2, RED: 3 };
const worst = (...hs: Health[]) => hs.reduce((w, h) => (RANK[h] > RANK[w] ? h : w), 'NONE' as Health);
const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;

/** Every project on one screen (roadmap item 5, the user's list,
 * 2026-11-04): stage, cost against budget, the programme against its
 * baseline, contract completion, client approvals waiting, risks and open
 * site items, each with a red / amber / green call and the portfolio in
 * rand. Setjeka staff only; each figure comes from the project's own screens
 * (the cost report, the baseline variance, the contracts), not a second
 * calculation. */
@Injectable()
export class PortfolioService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PortfolioService.name);
  /** The last portfolio worked out, and the one being worked out now
   * (critique H-07): every project's cost report and baseline is a few dozen
   * queries, so it's built in the background and served from here. Setjeka's
   * staff all see the same portfolio, so one copy serves everyone. */
  private cached: { at: number; data: Awaited<ReturnType<PortfolioService['build']>> } | null = null;
  private building: Promise<Awaited<ReturnType<PortfolioService['build']>>> | null = null;
  /** Older than this, it's rebuilt in the background while the old copy is served. */
  private static readonly FRESH_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commercial: CommercialService,
    private readonly costs: CostDatabaseService,
    private readonly baselines: ScheduleBaselinesService,
  ) {}

  /** Build the first copy shortly after start-up, so the first visit is quick. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => void this.refresh().catch((e) => this.logger.warn(`Portfolio warm-up failed: ${e}`)), 5_000).unref();
  }

  private refresh() {
    if (!this.building) {
      const started = Date.now();
      this.building = this.build()
        .then((data) => {
          this.cached = { at: Date.now(), data };
          this.logger.log(`Portfolio built: ${data.projects.length} projects in ${Date.now() - started} ms`);
          return data;
        })
        .finally(() => {
          this.building = null;
        });
    }
    return this.building;
  }

  private async assertStaff(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (!(user?.role === 'ADMIN' || user?.accountType === 'INTERNAL')) throw new ForbiddenException('The portfolio is for Setjeka staff');
  }

  /** The portfolio: served from the last copy, rebuilt behind it once that
   * copy is more than a minute old. */
  async portfolio(userId: string) {
    await this.assertStaff(userId);
    if (!this.cached) return this.refresh();
    if (Date.now() - this.cached.at > PortfolioService.FRESH_MS) void this.refresh().catch(() => undefined);
    return this.cached.data;
  }

  /** The headline totals only, for the dashboard. */
  async totals(userId: string) {
    return { totals: (await this.portfolio(userId)).totals };
  }

  /** The dashboard's "Today" tiles (critique H-06): open work across the
   * live projects. Plain counts, quick enough to read every time. */
  async today(userId: string) {
    await this.assertStaff(userId);
    const live = { project: { status: { notIn: ['ARCHIVED', 'COMPLETED'] as ('ARCHIVED' | 'COMPLETED')[] } } };
    const now = new Date();
    const [tasks, overdueTasks, rfis, overdueRfis, incidents] = await Promise.all([
      this.prisma.projectTask.count({ where: { ...live, status: { not: 'DONE' } } }),
      this.prisma.projectTask.count({ where: { ...live, status: { not: 'DONE' }, dueDate: { lt: now } } }),
      this.prisma.rfi.count({ where: { ...live, status: 'OPEN' } }),
      this.prisma.rfi.count({ where: { ...live, status: 'OPEN', dueDate: { lt: now } } }),
      this.prisma.hseIncident.count({ where: { ...live, status: { not: 'CLOSED' } } }),
    ]);
    return { tasks, overdueTasks, rfis, overdueRfis, incidents };
  }

  private async build() {
    // An internal account is used to read each project's baseline variance.
    const staff = await this.prisma.user.findFirst({ where: { OR: [{ role: 'ADMIN' }, { accountType: 'INTERNAL' }] }, select: { id: true } });
    const userId = staff?.id ?? '';
    const projects = await this.prisma.project.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: { id: true, name: true, projectCode: true, status: true, stage: true, currency: true, client: true, members: { where: { role: 'PROJECT_MANAGER' }, select: { externalName: true, user: { select: { fullName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const toRand = await this.costs.converter('ZAR');
    const missingFx = new Set<string>();
    const rand = (amount: number, from: Currency) => {
      const v = toRand(amount, from);
      if (v == null) missingFx.add(`${from} → ZAR`);
      return v ?? 0;
    };
    // A few at a time: each project's cost report is a handful of queries.
    const rows: Awaited<ReturnType<PortfolioService['row']>>[] = [];
    for (let i = 0; i < projects.length; i += 8) rows.push(...(await Promise.all(projects.slice(i, i + 8).map((p) => this.row(p, userId)))));
    const sum = (f: (r: (typeof rows)[number]) => number) => round(rows.reduce((s, r) => s + f(r), 0));
    const inRand = (f: (r: (typeof rows)[number]) => number) => sum((r) => rand(f(r), r.currency as Currency));
    return {
      generatedAt: new Date(),
      totals: {
        projects: rows.length,
        active: rows.filter((r) => r.status === 'ACTIVE').length,
        withBudget: rows.filter((r) => r.cost.revisedBudget > 0).length,
        revisedBudget: inRand((r) => r.cost.revisedBudget),
        projectedFinalCost: inRand((r) => r.cost.projectedFinalCost),
        committed: inRand((r) => r.cost.committed),
        paid: inRand((r) => r.cost.paid),
        overBudget: rows.filter((r) => r.health.cost === 'RED').length,
        behindProgramme: rows.filter((r) => r.programme.finishVarianceDays != null && r.programme.finishVarianceDays > 0).length,
        approvalsWaiting: sum((r) => r.approvals.waiting),
        approvalsOverdue: sum((r) => r.approvals.overdue),
        highRisks: sum((r) => r.risks.high),
        health: { RED: rows.filter((r) => r.health.overall === 'RED').length, AMBER: rows.filter((r) => r.health.overall === 'AMBER').length, GREEN: rows.filter((r) => r.health.overall === 'GREEN').length },
        currency: 'ZAR',
        missingFx: [...missingFx],
      },
      projects: rows,
    };
  }

  private async row(p: { id: string; name: string; projectCode: string | null; status: string; stage: string; currency: Currency; client: string | null; members: { externalName: string | null; user: { fullName: string } | null }[] }, userId: string) {
    const now = new Date();
    const due = { responseDueAt: { lt: now, not: null } };
    const [cost, variance, contracts, risks, approvals, overdue, site] = await Promise.all([
      this.commercial.summary(p.id),
      this.baselines.variance(p.id, userId),
      this.prisma.projectContract.findMany({ where: { projectId: p.id }, select: { completionDate: true, finalCompletionAt: true, penaltyPerDay: true, timeClaims: { select: { status: true, grantedDays: true } } } }),
      this.prisma.projectRisk.findMany({ where: { projectId: p.id, status: { not: 'CLOSED' } }, select: { probability: true, impact: true } }),
      Promise.all([
        this.prisma.stageDeliverable.count({ where: { projectId: p.id, status: 'SUBMITTED' } }),
        this.prisma.variation.count({ where: { projectId: p.id, status: 'SUBMITTED' } }),
        this.prisma.stageTransition.count({ where: { projectId: p.id, status: 'PENDING' } }),
        this.prisma.documentApprovalRequest.count({ where: { projectId: p.id, status: 'PENDING' } }),
        this.prisma.valuation.count({ where: { projectId: p.id, status: 'CERTIFIED' } }),
      ]),
      Promise.all([
        this.prisma.stageDeliverable.count({ where: { projectId: p.id, status: 'SUBMITTED', ...due } }),
        this.prisma.variation.count({ where: { projectId: p.id, status: 'SUBMITTED', ...due } }),
        this.prisma.stageTransition.count({ where: { projectId: p.id, status: 'PENDING', ...due } }),
        this.prisma.documentApprovalRequest.count({ where: { projectId: p.id, status: 'PENDING', ...due } }),
        this.prisma.valuation.count({ where: { projectId: p.id, status: 'CERTIFIED', ...due } }),
      ]),
      Promise.all([
        this.prisma.nonConformance.count({ where: { projectId: p.id, status: { notIn: ['CLOSED', 'VOID'] } } }),
        this.prisma.contractDefect.count({ where: { projectId: p.id, status: { in: ['REPORTED', 'OPEN', 'RECTIFIED'] } } }),
        this.prisma.timeClaim.count({ where: { projectId: p.id, status: { in: ['NOTIFIED', 'SUBMITTED'] } } }),
        this.prisma.handoverItem.count({ where: { projectId: p.id, status: { in: ['OUTSTANDING', 'SUBMITTED', 'RETURNED'] } } }),
        this.prisma.hseIncident.count({ where: { projectId: p.id, status: { not: 'CLOSED' } } }),
        openSeriousIncidents(this.prisma, p.id),
        this.prisma.workPermit.count({ where: { projectId: p.id, status: 'ISSUED', validFrom: { lte: now }, validTo: { gte: now } } }),
        expiredOpenPermits(this.prisma, p.id),
      ]),
    ]);

    // Cost: the cost report's projected final cost against what was set
    // aside - the original budget and its contingency. (Approved variations
    // are in the revised budget and draw on the contingency, so adding them
    // again would count them twice.)
    const t = cost.totals;
    const allowance = t.budget + cost.contingency.original;
    const over = cost.projectedFinalCost - allowance;
    const costHealth: Health = t.revisedBudget <= 0 ? 'NONE' : over > allowance * 0.05 || cost.contingency.remaining < 0 ? 'RED' : over > 0 || cost.contingency.remainingIfPendingApproved < 0 ? 'AMBER' : 'GREEN';

    // Programme: the latest baseline's forecast finish; contracts past their
    // revised completion date.
    const s = variance.summary;
    const lateContracts = contracts
      .map((c) => {
        if (!c.completionDate || c.finalCompletionAt) return 0;
        const granted = c.timeClaims.filter((x) => x.status === 'GRANTED' || x.status === 'PARTLY_GRANTED').reduce((n, x) => n + (x.grantedDays ?? 0), 0);
        return Math.max(0, Math.floor((now.getTime() - addDays(c.completionDate, granted).getTime()) / DAY));
      })
      .filter((d) => d > 0);
    const timeHealth: Health = !s && !contracts.some((c) => c.completionDate) ? 'NONE' : lateContracts.length || (s && s.finishVarianceDays > 10) ? 'RED' : s && (s.finishVarianceDays > 0 || s.slippedCritical > 0) ? 'AMBER' : 'GREEN';

    const waiting = approvals.reduce((a, b) => a + b, 0);
    const late = overdue.reduce((a, b) => a + b, 0);
    const approvalsHealth: Health = late ? 'RED' : waiting ? 'AMBER' : 'GREEN';
    const high = risks.filter((r) => r.probability * r.impact >= HIGH_SEVERITY_THRESHOLD).length;
    // An open serious incident (lost time, a death, or reportable) is a risk
    // the portfolio should not miss; any open incident is one to watch.
    // A permit past its end and not handed back is high-risk work nobody is
    // controlling: one to watch.
    const riskHealth: Health = high || site[5] ? 'RED' : risks.length || site[4] || site[7] ? 'AMBER' : 'GREEN';
    const pm = p.members[0];

    return {
      id: p.id,
      name: p.name,
      projectCode: p.projectCode,
      status: p.status,
      stage: p.stage,
      client: p.client,
      projectManager: pm ? (pm.user?.fullName ?? pm.externalName) : null,
      currency: p.currency,
      cost: {
        budgetLocked: cost.budgetLocked,
        budget: t.budget,
        contingency: cost.contingency.original,
        revisedBudget: t.revisedBudget,
        committed: t.committed,
        paid: t.paid,
        projectedFinalCost: cost.projectedFinalCost,
        overBudget: round(Math.max(over, 0)),
        contingencyRemaining: cost.contingency.remaining,
        pendingVariations: t.pendingVariations,
      },
      programme: {
        baseline: variance.baseline?.name ?? null,
        baselineFinish: variance.baseline?.finish ?? null,
        forecastFinish: s?.forecastFinish ?? null,
        finishVarianceDays: s ? s.finishVarianceDays : null,
        plannedPercent: s?.plannedPercent ?? null,
        actualPercent: s?.actualPercent ?? null,
        lateContracts: lateContracts.length,
        maxDaysLate: lateContracts.length ? Math.max(...lateContracts) : 0,
      },
      approvals: { waiting, overdue: late },
      risks: { open: risks.length, high },
      site: { ncrs: site[0], defects: site[1], claims: site[2], handover: site[3], incidents: site[4], seriousIncidents: site[5], permitsLive: site[6], permitsExpired: site[7] },
      health: { cost: costHealth, time: timeHealth, approvals: approvalsHealth, risk: riskHealth, overall: worst(costHealth, timeHealth, approvalsHealth, riskHealth) },
    };
  }
}
