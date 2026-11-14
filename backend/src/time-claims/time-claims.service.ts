import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Country, NotificationType, TimeClaimStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { projectCountry, siteDayNumber } from '../common/countries.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addDays, contractTerms } from '../common/contract-forms.js';
import type { AssessClaimDto, NotifyDelayDto, RespondClaimDto, SubmitClaimDto } from './dto/time-claims.dto.js';
import { diaryOver } from '../site-diary/site-diary.service.js';
import { formatDay } from '../common/dates.js';

const DAY = 86_400_000;
const INCLUDE = {
  contract: { select: { id: true, title: true, contractForm: true, contractorId: true, completionDate: true, contractor: { select: { name: true } } } },
  scheduleActivity: { select: { id: true, name: true } },
  variation: { select: { id: true, number: true, title: true } },
  rfi: { select: { id: true, rfiNumber: true, title: true } },
  notifiedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { fullName: true } },
  costVariation: { select: { id: true, number: true, status: true } },
} satisfies Prisma.TimeClaimInclude;
type Row = Prisma.TimeClaimGetPayload<{ include: typeof INCLUDE }>;

const DECIDED: TimeClaimStatus[] = ['GRANTED', 'PARTLY_GRANTED', 'REJECTED'];
const GRANTED: TimeClaimStatus[] = ['GRANTED', 'PARTLY_GRANTED'];
// Whole calendar days between two moments, counted on the dates of the
// project's country, so a notice late in the evening isn't rounded into the
// next day.
const days = (country: Country, a: Date, b: Date) => siteDayNumber(country, a) - siteDayNumber(country, b);

/** Delay notices and extension-of-time claims (the user's choice from the
 * role-by-role review, 2026-11-03; the donor app's notices and EOT claims).
 * The contractor gives notice of a delay event and then submits the claim,
 * within the form of contract's periods (late notice is flagged, not
 * refused: whether it bars the claim is the contract's business). The
 * Setjeka PM assesses it; the days granted move the contract's completion
 * date. Granted costs become a variation for the client to approve - the
 * client alone approves money (Meeting 3). The client sees decided claims
 * and the revised dates; a contractor sees only claims on their contracts. */
@Injectable()
export class TimeClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, fullName: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    return {
      userId,
      name: user?.fullName ?? 'Someone',
      internal,
      // The Setjeka PM (or DM) assesses claims.
      assessor: internal || roles.includes('PROJECT_MANAGER') || roles.includes('DEVELOPMENT_MANAGER'),
      client: !internal && roles.length > 0 && roles.every((r) => r === 'CLIENT'),
      contractor: !internal && roles.includes('CONTRACTOR'),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    };
  }
  private sees(w: Awaited<ReturnType<TimeClaimsService['who']>>, c: Row) {
    if (w.client) return DECIDED.includes(c.status);
    if (w.contractor) return w.contractorIds.has(c.contract.contractorId);
    return true;
  }

  private claimant(w: Awaited<ReturnType<TimeClaimsService['who']>>, contractorId: string) {
    return w.internal || (w.contractor && w.contractorIds.has(contractorId));
  }

  private shape(w: Awaited<ReturnType<TimeClaimsService['who']>>, c: Row) {
    const mine = this.claimant(w, c.contract.contractorId);
    const now = Date.now();
    const decided = DECIDED.includes(c.status);
    return {
      ...c,
      claimOverdue: c.status === 'NOTIFIED' && c.claimDueAt.getTime() < now,
      assessOverdue: c.status === 'SUBMITTED' && Boolean(c.assessDueAt && c.assessDueAt.getTime() < now),
      can: {
        submit: mine && c.status === 'NOTIFIED',
        withdraw: mine && (c.status === 'NOTIFIED' || c.status === 'SUBMITTED'),
        assess: w.assessor && (c.status === 'SUBMITTED' || (decided && c.response === 'DISPUTED')),
        respond: mine && !w.internal && decided && !c.response,
        raiseVariation: w.assessor && GRANTED.includes(c.status) && (c.grantedCost ?? 0) > 0 && !c.costVariationId,
      },
    };
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'TIME_CLAIM', entityId: id, message });
    }
  }

  private async people(projectId: string, where: Prisma.ProjectMemberWhereInput) {
    return (await this.prisma.projectMember.findMany({ where: { projectId, userId: { not: null }, ...where }, select: { userId: true } })).map((m) => m.userId);
  }

  /** Each contract's time position: the completion date, the days granted,
   * the revised date, and any days late with the penalty to date. */
  async contracts(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const country = await projectCountry(this.prisma, projectId);
    const rows = await this.prisma.projectContract.findMany({
      where: { projectId, ...(w.contractor ? { contractorId: { in: [...w.contractorIds] } } : {}) },
      select: { id: true, title: true, contractForm: true, contractorId: true, startDate: true, completionDate: true, penaltyPerDay: true, contractor: { select: { name: true } }, timeClaims: { select: { status: true, grantedDays: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const today = new Date();
    return rows.map(({ timeClaims, ...c }) => {
      const granted = timeClaims.filter((t) => GRANTED.includes(t.status)).reduce((s, t) => s + (t.grantedDays ?? 0), 0);
      const revised = c.completionDate ? addDays(c.completionDate, granted) : null;
      const late = revised ? Math.max(0, days(country, today, revised)) : 0;
      const terms = contractTerms(c.contractForm);
      return {
        ...c,
        terms: { noticeWithinDays: terms.noticeWithinDays, claimWithinDays: terms.claimWithinDays, assessWithinDays: terms.assessWithinDays, completion: terms.completion },
        grantedDays: granted,
        revisedCompletion: revised,
        daysLate: late,
        penaltyToDate: late && c.penaltyPerDay ? late * c.penaltyPerDay : 0,
        openClaims: timeClaims.filter((t) => t.status === 'NOTIFIED' || t.status === 'SUBMITTED').length,
        can: { notify: this.claimant(w, c.contractorId), penalty: w.assessor },
      };
    });
  }

  async setPenalty(projectId: string, userId: string, contractId: string, penaltyPerDay: number | null | undefined) {
    const w = await this.who(projectId, userId);
    if (!w.assessor) throw new ForbiddenException('The Setjeka PM records the contract penalty');
    const c = await this.prisma.projectContract.findFirst({ where: { id: contractId, projectId } });
    if (!c) throw new NotFoundException('Contract not found');
    await this.prisma.projectContract.update({ where: { id: contractId }, data: { penaltyPerDay: penaltyPerDay ?? null } });
    return (await this.contracts(projectId, userId)).find((x) => x.id === contractId);
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.timeClaim.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((c) => this.sees(w, c)).map((c) => this.shape(w, c));
  }

  private async load(w: Awaited<ReturnType<TimeClaimsService['who']>>, projectId: string, id: string) {
    const c = await this.prisma.timeClaim.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!c || !this.sees(w, c)) throw new NotFoundException('Claim not found');
    return c;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const c = await this.load(w, projectId, id);
    // The rain recorded on site while the delay ran: evidence for a weather claim.
    const to = c.eventEndedAt ?? new Date();
    const weather = await this.prisma.siteWeatherDay.findMany({ where: { projectId, date: { gte: new Date(c.eventStartedAt.toISOString().slice(0, 10)), lte: to } }, select: { date: true, precipitationMm: true } });
    const diary = await diaryOver(this.prisma, projectId, c.eventStartedAt, to);
    return { ...this.shape(w, c), weather: { days: weather.length, wetDays: weather.filter((d) => (d.precipitationMm ?? 0) >= 10).length, rainMm: Math.round(weather.reduce((s, d) => s + (d.precipitationMm ?? 0), 0)) }, diary: w.client ? null : diary };
  }

  private history(w: Awaited<ReturnType<TimeClaimsService['who']>>, c: { history: unknown }, status: string, comment?: string | null) {
    return [...((c.history as unknown[]) ?? []), { status, at: new Date().toISOString(), by: w.userId, name: w.name, comment: comment?.trim() || null }] as Prisma.InputJsonValue;
  }

  async notify(projectId: string, userId: string, dto: NotifyDelayDto) {
    const w = await this.who(projectId, userId);
    const country = await projectCountry(this.prisma, projectId);
    const contract = await this.prisma.projectContract.findFirst({ where: { id: dto.contractId, projectId }, select: { id: true, title: true, contractForm: true, contractorId: true } });
    if (!contract) throw new BadRequestException('Contract not found on this project');
    if (!this.claimant(w, contract.contractorId)) throw new ForbiddenException('The contractor on the contract gives notice of a delay');
    if (dto.scheduleActivityId && !(await this.prisma.scheduleActivity.findFirst({ where: { id: dto.scheduleActivityId, projectId } }))) throw new BadRequestException('That activity is not on this project');
    if (dto.variationId && !(await this.prisma.variation.findFirst({ where: { id: dto.variationId, projectId } }))) throw new BadRequestException('That variation is not on this project');
    if (dto.rfiId && !(await this.prisma.rfi.findFirst({ where: { id: dto.rfiId, projectId } }))) throw new BadRequestException('That RFI is not on this project');
    const started = new Date(dto.eventStartedAt);
    const now = new Date();
    if (started.getTime() > now.getTime() + DAY) throw new BadRequestException('Notice is given of an event that has begun');
    const terms = contractTerms(contract.contractForm);
    const late = days(country, now, addDays(started, terms.noticeWithinDays));
    const last = await this.prisma.timeClaim.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const c = await this.prisma.timeClaim.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description.trim(),
        eventStartedAt: started,
        notifiedAt: now,
        notifiedById: userId,
        lateNoticeDays: late > 0 ? late : null,
        claimDueAt: addDays(now, terms.claimWithinDays),
        projectId,
        sequence,
        number: `EOT-${String(sequence).padStart(3, '0')}`,
        history: [{ status: 'NOTIFIED', at: now.toISOString(), by: userId, name: w.name, comment: late > 0 ? `Notice ${late} days after the ${terms.noticeWithinDays}-day period` : 'Notice given' }],
      },
      include: INCLUDE,
    });
    await this.tell(projectId, await this.people(projectId, { role: { in: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR'] } }), userId, 'TIME_CLAIM_NOTIFIED', c.id, `${c.number}: ${c.contract.contractor.name} gave notice of a delay - "${c.title}". The claim is due by ${formatDay(c.claimDueAt)}.`);
    return this.shape(w, c);
  }

  private async syncRegister(c: Row, userId: string, status: string, extra: Prisma.ProjectRegisterEntryUncheckedUpdateInput = {}) {
    const data = {
      reference: c.number,
      title: `Extension of time: ${c.title}`,
      contractorId: c.contract.contractorId,
      date: c.submittedAt ?? c.notifiedAt,
      amount: c.costClaimed,
      days: c.requestedDays,
      status,
      ...extra,
    };
    if (c.registerEntryId && (await this.prisma.projectRegisterEntry.findUnique({ where: { id: c.registerEntryId } }))) {
      await this.prisma.projectRegisterEntry.update({ where: { id: c.registerEntryId }, data });
      return c.registerEntryId;
    }
    const e = await this.prisma.projectRegisterEntry.create({ data: { ...(data as Prisma.ProjectRegisterEntryUncheckedCreateInput), projectId: c.projectId, register: 'claims', createdById: userId } });
    return e.id;
  }

  async submit(projectId: string, userId: string, id: string, dto: SubmitClaimDto) {
    const w = await this.who(projectId, userId);
    const country = await projectCountry(this.prisma, projectId);
    const c = await this.load(w, projectId, id);
    if (!this.claimant(w, c.contract.contractorId)) throw new ForbiddenException('The contractor on the contract submits the claim');
    if (c.status !== 'NOTIFIED') throw new BadRequestException('The claim has already been submitted');
    const ended = dto.eventEndedAt ? new Date(dto.eventEndedAt) : null;
    if (ended && ended < c.eventStartedAt) throw new BadRequestException('The delay ends after it begins');
    const now = new Date();
    const terms = contractTerms(c.contract.contractForm);
    const late = days(country, now, c.claimDueAt);
    const updated = await this.prisma.timeClaim.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        requestedDays: dto.requestedDays,
        costClaimed: dto.costClaimed ?? null,
        particulars: dto.particulars.trim(),
        eventEndedAt: ended,
        submittedAt: now,
        assessDueAt: addDays(now, terms.assessWithinDays),
        history: this.history(w, c, 'SUBMITTED', `${dto.requestedDays} days claimed${dto.costClaimed ? ` with costs of ${dto.costClaimed.toLocaleString('en-ZA')}` : ''}${late > 0 ? `, ${late} days after the claim was due` : ''}`),
      },
      include: INCLUDE,
    });
    const entryId = await this.syncRegister(updated, userId, 'UNDER_REVIEW');
    await this.prisma.timeClaim.update({ where: { id }, data: { registerEntryId: entryId } });
    await this.tell(projectId, await this.people(projectId, { role: { in: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR'] } }), userId, 'TIME_CLAIM_SUBMITTED', id, `${c.number} "${c.title}": ${dto.requestedDays} days claimed. Assess it by ${formatDay(addDays(now, terms.assessWithinDays))}.`);
    return this.findOne(projectId, userId, id);
  }

  async assess(projectId: string, userId: string, id: string, dto: AssessClaimDto) {
    const w = await this.who(projectId, userId);
    const c = await this.load(w, projectId, id);
    if (!w.assessor) throw new ForbiddenException('The Setjeka PM assesses extension-of-time claims');
    if (!(c.status === 'SUBMITTED' || (DECIDED.includes(c.status) && c.response === 'DISPUTED'))) throw new BadRequestException('Only a submitted claim, or a disputed assessment, is assessed');
    if (dto.grantedDays > (c.requestedDays ?? 0)) throw new BadRequestException(`No more than the ${c.requestedDays} days claimed can be granted`);
    if ((dto.grantedCost ?? 0) > (c.costClaimed ?? 0)) throw new BadRequestException('No more than the costs claimed can be granted');
    if (c.costVariationId && (dto.grantedCost ?? 0) !== (c.grantedCost ?? 0)) throw new BadRequestException(`The costs are already with the client as ${c.costVariation?.number}; change them there`);
    const status: TimeClaimStatus = dto.grantedDays === 0 && !dto.grantedCost ? 'REJECTED' : dto.grantedDays === c.requestedDays && (dto.grantedCost ?? 0) >= (c.costClaimed ?? 0) ? 'GRANTED' : 'PARTLY_GRANTED';
    const updated = await this.prisma.timeClaim.update({
      where: { id },
      data: {
        status,
        grantedDays: dto.grantedDays,
        grantedCost: dto.grantedCost ?? null,
        assessment: dto.assessment.trim(),
        decidedAt: new Date(),
        decidedById: userId,
        response: null,
        responseNote: null,
        respondedAt: null,
        history: this.history(w, c, status, `${dto.grantedDays} of ${c.requestedDays} days${dto.grantedCost ? `, costs ${dto.grantedCost.toLocaleString('en-ZA')}` : ''}`),
      },
      include: INCLUDE,
    });
    await this.syncRegister(updated, userId, status === 'REJECTED' ? 'REJECTED' : 'AGREED', { amount2: dto.grantedCost ?? null, completedAt: new Date(), notes: `${dto.grantedDays} days granted. ${dto.assessment.trim()}` });
    const contractor = await this.people(projectId, { contractorId: c.contract.contractorId, role: 'CONTRACTOR' });
    await this.tell(projectId, [c.notifiedById, ...contractor], userId, 'TIME_CLAIM_DECIDED', id, `${c.number} "${c.title}": ${dto.grantedDays} of ${c.requestedDays} days granted`);
    if (dto.grantedDays > 0) {
      const summary = (await this.contracts(projectId, userId)).find((x) => x.id === c.contractId);
      const moved = summary?.revisedCompletion ? `; completion is now ${formatDay(summary.revisedCompletion)}` : '';
      await this.tell(projectId, await this.people(projectId, { role: 'CLIENT' }), userId, 'TIME_CLAIM_DECIDED', id, `${c.contract.title}: ${dto.grantedDays} days' extension of time granted${moved}`);
    }
    return this.findOne(projectId, userId, id);
  }

  async respond(projectId: string, userId: string, id: string, dto: RespondClaimDto) {
    const w = await this.who(projectId, userId);
    const c = await this.load(w, projectId, id);
    if (!this.shape(w, c).can.respond) throw new BadRequestException('The contractor answers an assessment once');
    if (dto.response === 'DISPUTED' && !dto.note?.trim()) throw new BadRequestException('Say why you dispute the assessment');
    await this.prisma.timeClaim.update({ where: { id }, data: { response: dto.response, responseNote: dto.note?.trim() || null, respondedAt: new Date(), history: this.history(w, c, dto.response, dto.note) } });
    if (dto.response === 'DISPUTED' && c.registerEntryId) await this.prisma.projectRegisterEntry.update({ where: { id: c.registerEntryId }, data: { status: 'UNDER_REVIEW' } }).catch(() => undefined);
    await this.tell(projectId, [c.decidedById], userId, 'TIME_CLAIM_RESPONDED', id, `${c.number} "${c.title}": the contractor ${dto.response === 'ACCEPTED' ? 'accepted' : 'disputes'} the assessment${dto.note ? ` - ${dto.note}` : ''}`);
    return this.findOne(projectId, userId, id);
  }

  async withdraw(projectId: string, userId: string, id: string, reason: string) {
    const w = await this.who(projectId, userId);
    const c = await this.load(w, projectId, id);
    if (!this.shape(w, c).can.withdraw) throw new BadRequestException('Only an undecided claim is withdrawn, by its contractor');
    const updated = await this.prisma.timeClaim.update({ where: { id }, data: { status: 'WITHDRAWN', history: this.history(w, c, 'WITHDRAWN', reason) }, include: INCLUDE });
    if (updated.registerEntryId) await this.syncRegister(updated, userId, 'WITHDRAWN');
    return this.findOne(projectId, userId, id);
  }

  /** The granted costs as a draft variation on the contract, which then goes
   * the usual way: assessed, and decided by the client. */
  async raiseVariation(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const c = await this.load(w, projectId, id);
    if (!this.shape(w, c).can.raiseVariation) throw new BadRequestException('Only granted costs not yet with the client are raised as a variation');
    const rows = await this.prisma.variation.findMany({ where: { projectId }, select: { number: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r.number.replace(/\D/g, ''), 10) || 0), 0);
    const v = await this.prisma.variation.create({
      data: {
        projectId,
        number: `VO-${String(max + 1).padStart(3, '0')}`,
        title: `Costs of delay: ${c.title} (${c.number})`,
        description: `Time-related costs granted on ${c.number}: ${c.grantedDays} days' extension. ${c.assessment ?? ''}`.trim(),
        reason: 'OTHER',
        estimatedValue: c.grantedCost ?? 0,
        timeImpactDays: c.grantedDays,
        contractId: c.contractId,
        raisedById: userId,
        events: { create: { toStatus: 'DRAFT', actorId: userId, comment: `Raised from ${c.number}` } },
      },
    });
    await this.prisma.timeClaim.update({ where: { id }, data: { costVariationId: v.id, history: this.history(w, c, c.status, `Costs raised as ${v.number} for the client`) } });
    return this.findOne(projectId, userId, id);
  }
}
