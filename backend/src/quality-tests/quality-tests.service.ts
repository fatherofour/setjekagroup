import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { HoldPointStatus, NotificationType, TestOutcome, TestRule } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { DESIGN_CONSULTANTS } from '../common/consultants.js';
import type { CriterionDto, HoldPointDto, NotifyHoldPointDto, RecordTestDto, UpdateCriterionDto } from './dto/quality.dto.js';

/** The usual South African site tests, offered as a starting set. Values are
 * typical; the engineer edits them to the specification. */
export const STARTER_CRITERIA: CriterionDto[] = [
  { code: 'CUBE-28', name: 'Concrete cube strength at 28 days', standardRef: 'SANS 5863', unit: 'MPa', rule: 'MIN', minValue: 30, frequency: '1 set of 3 cubes per 50 m³ or per pour, whichever is more' },
  { code: 'SLUMP', name: 'Concrete slump', standardRef: 'SANS 5862-1', unit: 'mm', rule: 'RANGE', minValue: 75, maxValue: 125, frequency: 'Every truck' },
  { code: 'COMP-BASE', name: 'Compaction of base layer', standardRef: 'SANS 3001-NG5', unit: '% Mod AASHTO', rule: 'MIN', minValue: 98, frequency: 'Every 500 m² per layer' },
  { code: 'COMP-SUBBASE', name: 'Compaction of subbase layer', standardRef: 'SANS 3001-NG5', unit: '% Mod AASHTO', rule: 'MIN', minValue: 95, frequency: 'Every 500 m² per layer' },
  { code: 'COMP-FILL', name: 'Compaction of fill and selected layers', standardRef: 'SANS 3001-NG5', unit: '% Mod AASHTO', rule: 'MIN', minValue: 93, frequency: 'Every 500 m² per layer' },
  { code: 'PRESS-WATER', name: 'Water main pressure test', standardRef: 'SANS 1200 L', rule: 'PASS_FAIL', frequency: 'Each section, before backfilling' },
  { code: 'DRAIN-TEST', name: 'Drainage air or water test', standardRef: 'SANS 10400-P', rule: 'PASS_FAIL', frequency: 'Each run, before backfilling' },
  { code: 'INSUL-RES', name: 'Insulation resistance', standardRef: 'SANS 10142-1', unit: 'MΩ', rule: 'MIN', minValue: 1, frequency: 'Each circuit, before the certificate of compliance' },
];

const OPEN_POINT: HoldPointStatus[] = ['PLANNED', 'NOTIFIED'];

const TEST_INCLUDE = {
  criterion: { select: { id: true, code: true, name: true, unit: true, rule: true, minValue: true, maxValue: true } },
  contractor: { select: { id: true, name: true } },
  scheduleActivity: { select: { id: true, name: true } },
  holdPoint: { select: { id: true, number: true, title: true } },
  retestOf: { select: { id: true, number: true, outcome: true } },
  retests: { select: { id: true, number: true, outcome: true }, orderBy: { sequence: 'asc' as const } },
  recordedBy: { select: { id: true, fullName: true } },
  reviewedBy: { select: { fullName: true } },
  ncrs: { select: { id: true, number: true, status: true } },
} satisfies Prisma.TestResultInclude;

const POINT_INCLUDE = {
  criterion: { select: { id: true, code: true, name: true } },
  contractor: { select: { id: true, name: true } },
  scheduleActivity: { select: { id: true, name: true } },
  releaser: { select: { id: true, role: true, userId: true, externalName: true, user: { select: { fullName: true } } } },
  notifiedBy: { select: { fullName: true } },
  releasedBy: { select: { fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  tests: { select: { id: true, number: true, outcome: true, testedAt: true }, orderBy: { sequence: 'asc' as const } },
} satisfies Prisma.HoldPointInclude;

type Who = Awaited<ReturnType<QualityTestsService['who']>>;
type Point = Prisma.HoldPointGetPayload<{ include: typeof POINT_INCLUDE }>;
type Test = Prisma.TestResultGetPayload<{ include: typeof TEST_INCLUDE }>;

/** Whether a measured value meets its criterion. */
export function judge(rule: TestRule, min: number | null, max: number | null, value: number | null | undefined, given?: TestOutcome): TestOutcome {
  if (rule === 'PASS_FAIL') {
    if (!given) throw new BadRequestException('Say whether the test passed or failed');
    return given;
  }
  if (value == null || Number.isNaN(value)) throw new BadRequestException('Enter the measured value');
  if ((rule === 'MIN' || rule === 'RANGE') && min != null && value < min) return 'FAIL';
  if ((rule === 'MAX' || rule === 'RANGE') && max != null && value > max) return 'FAIL';
  return 'PASS';
}

/** Test results against acceptance criteria, and the hold and witness points
 * of the inspection and test plan (the user's choice, 2026-11-03; the donor
 * app's construction_control). Setjeka, the design consultants and QA/QC set
 * the criteria and points; the contractor (or anyone on site) records
 * results; the reviewer signs them off. A hold point stops its programme
 * activity until released. The client sees none of it, as with inspections;
 * a contractor sees only their own work. */
@Injectable()
export class QualityTestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    const quality = internal || roles.some((r) => DESIGN_CONSULTANTS.includes(r) || r === 'QA_QC_MANAGER');
    if (!internal && roles.includes('CLIENT') && !quality) throw new NotFoundException('Not found');
    return {
      userId,
      internal,
      memberIds: new Set(members.map((m) => m.id)),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
      contractor: !quality && roles.includes('CONTRACTOR'),
      /** Sets criteria and points, and reviews results. */
      quality,
      /** Records results and gives notice. */
      site: quality || roles.includes('CONTRACTOR') || roles.includes('SITE_MANAGER'),
    };
  }

  private sees(w: Who, contractorId: string | null) {
    return !w.contractor || Boolean(contractorId && w.contractorIds.has(contractorId));
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, entityType: 'TEST_RESULT' | 'HOLD_POINT', id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType, entityId: id, message });
    }
  }

  private async contractorPeople(projectId: string, contractorId: string | null) {
    if (!contractorId) return [];
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, contractorId, role: 'CONTRACTOR', userId: { not: null } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async qualityPeople(projectId: string) {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['PROJECT_MANAGER', 'QA_QC_MANAGER'] }, userId: { not: null } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async inProject(model: 'scheduleActivity' | 'contractor', id: string | undefined, projectId: string, what: string) {
    if (!id) return;
    const found =
      model === 'scheduleActivity'
        ? await this.prisma.scheduleActivity.findFirst({ where: { id, projectId } })
        : await this.prisma.projectMember.findFirst({ where: { projectId, contractorId: id } });
    if (!found) throw new BadRequestException(`That ${what} is not on this project`);
  }

  /** What the forms pick from: the programme, the contractors on the team,
   * and who can release a point. */
  async options(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const [activities, members] = await Promise.all([
      this.prisma.scheduleActivity.findMany({ where: { projectId, activityType: { not: 'MILESTONE' } }, select: { id: true, name: true }, orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.projectMember.findMany({ where: { projectId }, select: { id: true, role: true, externalName: true, contractorId: true, contractor: { select: { id: true, name: true } }, user: { select: { fullName: true } } } }),
    ]);
    const contractors = [...new Map(members.filter((m) => m.contractor && m.role === 'CONTRACTOR').map((m) => [m.contractor!.id, m.contractor!])).values()];
    const releasers = members
      .filter((m) => DESIGN_CONSULTANTS.includes(m.role) || ['QA_QC_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'].includes(m.role))
      .map((m) => ({ id: m.id, role: m.role, name: m.user?.fullName ?? m.externalName ?? 'Unnamed' }));
    return { activities, contractors: w.contractor ? contractors.filter((c) => w.contractorIds.has(c.id)) : contractors, releasers, can: { define: w.quality, record: w.site, review: w.quality } };
  }

  // ---- Acceptance criteria -------------------------------------------------

  async criteria(projectId: string, userId: string) {
    await this.who(projectId, userId);
    return this.prisma.testCriterion.findMany({ where: { projectId }, orderBy: [{ active: 'desc' }, { code: 'asc' }], include: { _count: { select: { results: true } } } });
  }

  private checkLimits(rule: TestRule, min: number | null | undefined, max: number | null | undefined) {
    if (rule === 'MIN' && min == null) throw new BadRequestException('A minimum criterion needs its minimum value');
    if (rule === 'MAX' && max == null) throw new BadRequestException('A maximum criterion needs its maximum value');
    if (rule === 'RANGE' && (min == null || max == null || min > max)) throw new BadRequestException('A range needs a minimum no higher than its maximum');
  }

  async createCriterion(projectId: string, userId: string, dto: CriterionDto) {
    const w = await this.who(projectId, userId);
    if (!w.quality) throw new ForbiddenException('Setjeka, the engineers and QA/QC set the acceptance criteria');
    this.checkLimits(dto.rule, dto.minValue, dto.maxValue);
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.testCriterion.findUnique({ where: { projectId_code: { projectId, code } } })) throw new BadRequestException(`${code} is already a criterion on this project`);
    return this.prisma.testCriterion.create({ data: { ...dto, code, name: dto.name.trim(), projectId } });
  }

  /** Adds whichever of the starting set the project doesn't have yet. */
  async addStarter(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    if (!w.quality) throw new ForbiddenException('Setjeka, the engineers and QA/QC set the acceptance criteria');
    const have = new Set((await this.prisma.testCriterion.findMany({ where: { projectId }, select: { code: true } })).map((c) => c.code));
    const add = STARTER_CRITERIA.filter((c) => !have.has(c.code));
    if (add.length) await this.prisma.testCriterion.createMany({ data: add.map((c) => ({ ...c, projectId })) });
    return this.criteria(projectId, userId);
  }

  async updateCriterion(projectId: string, userId: string, id: string, dto: UpdateCriterionDto) {
    const w = await this.who(projectId, userId);
    if (!w.quality) throw new ForbiddenException('Setjeka, the engineers and QA/QC set the acceptance criteria');
    const c = await this.prisma.testCriterion.findFirst({ where: { id, projectId } });
    if (!c) throw new NotFoundException('Criterion not found');
    const rule = dto.rule ?? c.rule;
    this.checkLimits(rule, dto.minValue === undefined ? c.minValue : dto.minValue, dto.maxValue === undefined ? c.maxValue : dto.maxValue);
    return this.prisma.testCriterion.update({ where: { id }, data: dto });
  }

  // ---- Test results ----------------------------------------------------------

  private shapeTest(w: Who, t: Test) {
    return {
      ...t,
      can: {
        review: w.quality && t.status === 'RECORDED',
        raiseNcr: w.quality && t.outcome === 'FAIL' && !t.ncrs.some((n) => n.status !== 'VOID'),
        retest: w.site && t.outcome === 'FAIL' && !t.retests.length,
      },
    };
  }

  async tests(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.testResult.findMany({ where: { projectId }, include: TEST_INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((t) => this.sees(w, t.contractorId)).map((t) => this.shapeTest(w, t));
  }

  async test(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const t = await this.prisma.testResult.findFirst({ where: { id, projectId }, include: TEST_INCLUDE });
    if (!t || !this.sees(w, t.contractorId)) throw new NotFoundException('Test result not found');
    return this.shapeTest(w, t);
  }

  async record(projectId: string, userId: string, dto: RecordTestDto) {
    const w = await this.who(projectId, userId);
    if (!w.site) throw new ForbiddenException('The contractor, the site team, the engineers and QA/QC record test results');
    const c = await this.prisma.testCriterion.findFirst({ where: { id: dto.criterionId, projectId } });
    if (!c) throw new BadRequestException('Criterion not found on this project');
    if (!c.active) throw new BadRequestException(`${c.code} is no longer in use`);
    let contractorId = dto.contractorId ?? null;
    if (w.contractor) {
      if (contractorId && !w.contractorIds.has(contractorId)) throw new ForbiddenException('You record results for your own work');
      contractorId = contractorId ?? [...w.contractorIds][0] ?? null;
    }
    await this.inProject('contractor', contractorId ?? undefined, projectId, 'contractor');
    await this.inProject('scheduleActivity', dto.scheduleActivityId, projectId, 'activity');
    if (dto.holdPointId) {
      const p = await this.prisma.holdPoint.findFirst({ where: { id: dto.holdPointId, projectId } });
      if (!p || !this.sees(w, p.contractorId)) throw new BadRequestException('Hold point not found on this project');
    }
    if (dto.retestOfId) {
      const r = await this.prisma.testResult.findFirst({ where: { id: dto.retestOfId, projectId } });
      if (!r || !this.sees(w, r.contractorId)) throw new BadRequestException('The test being retested is not on this project');
    }
    const outcome = judge(c.rule, c.minValue, c.maxValue, dto.value, dto.outcome);
    const last = await this.prisma.testResult.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const t = await this.prisma.testResult.create({
      data: {
        ...dto,
        contractorId,
        title: dto.title.trim(),
        location: dto.location?.trim() || null,
        value: c.rule === 'PASS_FAIL' ? (dto.value ?? null) : dto.value,
        outcome,
        sampledAt: dto.sampledAt ? new Date(dto.sampledAt) : null,
        testedAt: new Date(dto.testedAt),
        projectId,
        sequence,
        number: `TR-${String(sequence).padStart(3, '0')}`,
        recordedById: userId,
      },
      include: TEST_INCLUDE,
    });
    const point = t.holdPointId ? await this.prisma.holdPoint.findUnique({ where: { id: t.holdPointId }, select: { releaser: { select: { userId: true } } } }) : null;
    const reviewers = [...(await this.qualityPeople(projectId)), point?.releaser?.userId];
    if (outcome === 'FAIL') {
      await this.tell(projectId, [...reviewers, ...(await this.contractorPeople(projectId, contractorId))], userId, 'TEST_FAILED', 'TEST_RESULT', t.id, `${t.number} ${c.name} FAILED: ${t.title}${t.value != null ? ` (${t.value}${c.unit ? ` ${c.unit}` : ''})` : ''}`);
    } else if (!w.quality) {
      await this.tell(projectId, reviewers, userId, 'TEST_RECORDED', 'TEST_RESULT', t.id, `${t.number} ${c.name} recorded for ${t.title}: review it`);
    }
    return this.shapeTest(w, t);
  }

  async review(projectId: string, userId: string, id: string, comment?: string) {
    const w = await this.who(projectId, userId);
    if (!w.quality) throw new ForbiddenException('The engineers, QA/QC or Setjeka review test results');
    const t = await this.test(projectId, userId, id);
    if (t.status !== 'RECORDED') throw new BadRequestException('This result has already been reviewed');
    await this.prisma.testResult.update({ where: { id }, data: { status: 'REVIEWED', reviewedById: userId, reviewedAt: new Date(), reviewComment: comment?.trim() || null } });
    return this.test(projectId, userId, id);
  }

  // ---- Hold and witness points ----------------------------------------------

  private canRelease(w: Who, p: { releaserId: string | null }) {
    return w.internal || (w.quality && (!p.releaserId || w.memberIds.has(p.releaserId)));
  }

  private canNotify(w: Who, p: { contractorId: string | null }) {
    return w.internal || (w.site && this.sees(w, p.contractorId));
  }

  private shapePoint(w: Who, p: Point) {
    const open = OPEN_POINT.includes(p.status);
    const passed = !p.criterion || p.tests.some((t) => t.outcome === 'PASS');
    return {
      ...p,
      needsPassingTest: Boolean(p.criterion) && !passed,
      can: {
        notify: this.canNotify(w, p) && p.status === 'PLANNED',
        release: this.canRelease(w, p) && open && passed,
        notReady: this.canRelease(w, p) && p.status === 'NOTIFIED',
        proceed: this.canNotify(w, p) && p.kind === 'WITNESS' && p.status === 'NOTIFIED' && Boolean(p.readyAt && p.readyAt.getTime() <= Date.now()),
        cancel: w.quality && open,
        recordTest: w.site && open && this.sees(w, p.contractorId),
      },
    };
  }

  async points(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.holdPoint.findMany({ where: { projectId }, include: POINT_INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((p) => this.sees(w, p.contractorId)).map((p) => this.shapePoint(w, p));
  }

  async point(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const p = await this.prisma.holdPoint.findFirst({ where: { id, projectId }, include: POINT_INCLUDE });
    if (!p || !this.sees(w, p.contractorId)) throw new NotFoundException('Hold point not found');
    return this.shapePoint(w, p);
  }

  async createPoint(projectId: string, userId: string, dto: HoldPointDto) {
    const w = await this.who(projectId, userId);
    if (!w.quality) throw new ForbiddenException('Setjeka, the engineers and QA/QC set the hold and witness points');
    await this.inProject('scheduleActivity', dto.scheduleActivityId, projectId, 'activity');
    await this.inProject('contractor', dto.contractorId, projectId, 'contractor');
    if (dto.criterionId && !(await this.prisma.testCriterion.findFirst({ where: { id: dto.criterionId, projectId } }))) throw new BadRequestException('Criterion not found on this project');
    if (dto.releaserId && !(await this.prisma.projectMember.findFirst({ where: { id: dto.releaserId, projectId } }))) throw new BadRequestException('That person is not on this project');
    const last = await this.prisma.holdPoint.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const p = await this.prisma.holdPoint.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        location: dto.location?.trim() || null,
        projectId,
        sequence,
        number: `${dto.kind === 'HOLD' ? 'HP' : 'WP'}-${String(sequence).padStart(3, '0')}`,
        createdById: userId,
        history: [{ status: 'PLANNED', at: new Date().toISOString(), by: userId, comment: 'Set' }],
      },
    });
    return this.point(projectId, userId, p.id);
  }

  private async move(p: Point, userId: string, to: HoldPointStatus, comment: string | null | undefined, data: Prisma.HoldPointUncheckedUpdateInput = {}) {
    const history = [...((p.history as unknown[]) ?? []), { status: to, at: new Date().toISOString(), by: userId, comment: comment?.trim() || null }];
    await this.prisma.holdPoint.update({ where: { id: p.id }, data: { ...data, status: to, history: history as Prisma.InputJsonValue } });
  }

  /** The contractor gives notice that the work will be ready, at least the
   * notice period ahead. */
  async notify(projectId: string, userId: string, id: string, dto: NotifyHoldPointDto) {
    const w = await this.who(projectId, userId);
    const p = await this.point(projectId, userId, id);
    if (!this.canNotify(w, p)) throw new ForbiddenException('The contractor whose work it is gives notice');
    if (p.status !== 'PLANNED') throw new BadRequestException('Notice has already been given');
    const readyAt = new Date(dto.readyAt);
    if (readyAt.getTime() < Date.now() + p.noticeHours * 3_600_000 - 60_000) throw new BadRequestException(`Give at least ${p.noticeHours} hours' notice`);
    await this.move(p, userId, 'NOTIFIED', dto.comment, { readyAt, notifiedAt: new Date(), notifiedById: userId });
    const to = p.releaser?.userId ? [p.releaser.userId] : [p.createdBy.id];
    await this.tell(projectId, to, userId, 'HOLD_POINT_NOTIFIED', 'HOLD_POINT', id, `${p.number} "${p.title}" will be ready ${readyAt.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}: ${p.kind === 'HOLD' ? 'inspect and release it' : 'come and witness it'}`);
    return this.point(projectId, userId, id);
  }

  async release(projectId: string, userId: string, id: string, comment?: string) {
    const w = await this.who(projectId, userId);
    const p = await this.point(projectId, userId, id);
    if (!this.canRelease(w, p)) throw new ForbiddenException('Only the person named to release it, or Setjeka, releases it');
    if (!OPEN_POINT.includes(p.status)) throw new BadRequestException(`This point is ${p.status.toLowerCase()}`);
    if (p.needsPassingTest) throw new BadRequestException(`Record a passing ${p.criterion!.code} test against ${p.number} first`);
    await this.move(p, userId, 'RELEASED', comment || 'Released', { releasedAt: new Date(), releasedById: userId, releaseComment: comment?.trim() || null });
    await this.tell(projectId, [...(await this.contractorPeople(projectId, p.contractorId)), p.notifiedById], userId, 'HOLD_POINT_DECIDED', 'HOLD_POINT', id, `${p.number} "${p.title}" was ${p.kind === 'HOLD' ? 'released: the work can go ahead' : 'witnessed'}`);
    return this.point(projectId, userId, id);
  }

  async notReady(projectId: string, userId: string, id: string, reason: string) {
    const w = await this.who(projectId, userId);
    const p = await this.point(projectId, userId, id);
    if (!this.canRelease(w, p)) throw new ForbiddenException('Only the person named to release it, or Setjeka, turns it back');
    if (p.status !== 'NOTIFIED') throw new BadRequestException('No notice has been given');
    await this.move(p, userId, 'PLANNED', reason, { readyAt: null, notifiedAt: null });
    await this.tell(projectId, await this.contractorPeople(projectId, p.contractorId), userId, 'HOLD_POINT_DECIDED', 'HOLD_POINT', id, `${p.number} "${p.title}" is not ready - ${reason}. Give notice again when it is.`);
    return this.point(projectId, userId, id);
  }

  /** A witness point whose witness did not come by the notified time: the
   * contractor may go ahead. A hold point never can. */
  async proceed(projectId: string, userId: string, id: string, comment?: string) {
    const w = await this.who(projectId, userId);
    const p = await this.point(projectId, userId, id);
    if (!this.canNotify(w, p)) throw new ForbiddenException('The contractor whose work it is goes ahead');
    if (p.kind !== 'WITNESS') throw new BadRequestException('A hold point has to be released before the work goes ahead');
    if (p.status !== 'NOTIFIED' || !p.readyAt || p.readyAt.getTime() > Date.now()) throw new BadRequestException('You can go ahead only after the notified time has passed');
    await this.move(p, userId, 'PROCEEDED', comment || 'Not witnessed by the notified time; went ahead');
    await this.tell(projectId, [p.releaser?.userId ?? p.createdBy.id], userId, 'HOLD_POINT_DECIDED', 'HOLD_POINT', id, `${p.number} "${p.title}" was not witnessed by the notified time, and the contractor went ahead`);
    return this.point(projectId, userId, id);
  }

  async cancel(projectId: string, userId: string, id: string, reason: string) {
    const w = await this.who(projectId, userId);
    const p = await this.point(projectId, userId, id);
    if (!w.quality) throw new ForbiddenException('Setjeka, the engineers and QA/QC cancel points');
    if (!OPEN_POINT.includes(p.status)) throw new BadRequestException(`This point is ${p.status.toLowerCase()}`);
    await this.move(p, userId, 'CANCELLED', reason, { cancelReason: reason.trim() });
    return this.point(projectId, userId, id);
  }
}

/** Hold points not yet released on an activity: progress waits for them. */
export async function unreleasedHolds(prisma: PrismaService, scheduleActivityId: string) {
  return prisma.holdPoint.findMany({ where: { scheduleActivityId, kind: 'HOLD', status: { in: OPEN_POINT } }, select: { number: true, title: true }, orderBy: { sequence: 'asc' } });
}
