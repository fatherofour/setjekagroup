import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { round } from '../cost-database/pricing.js';
import { holdersOf } from '../common/consultants.js';
import type { CreateDayworkDto, CreateMeasurementDto } from './dto/qs.dto.js';

const PERSON = { select: { fullName: true } } as const;

/** Site measurement and dayworks on a contract (the user's choice, 2 Nov
 * 2026; the donor app's site measurements and daywork sheets, rebuilt).
 * The QS, Setjeka or the contract's engineer measures the work and signs
 * daywork sheets; the contractor agrees or disputes each measurement and
 * submits daywork sheets. Agreed quantities and signed dayworks flow into
 * the contract's valuations. The client doesn't see this. */
@Injectable()
export class SiteMeasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true, contractorId: true } }),
    ]);
    return {
      userId,
      internal: user?.role === 'ADMIN' || user?.accountType === 'INTERNAL',
      roles: members.map((m) => m.role),
      contractorIds: new Set(members.filter((m) => m.role === 'CONTRACTOR' && m.contractorId).map((m) => m.contractorId!)),
    };
  }

  /** Who measures and signs: Setjeka, the QS, and the engineer (or
   * architect) named on the contract to review its valuations. */
  private measures(w: Awaited<ReturnType<SiteMeasureService['who']>>, c: { reviewerRole: string }) {
    return w.internal || w.roles.includes('QUANTITY_SURVEYOR') || holdersOf(c.reviewerRole as never).some((r) => w.roles.includes(r));
  }

  private isContractor(w: Awaited<ReturnType<SiteMeasureService['who']>>, c: { contractorId: string }) {
    return w.contractorIds.has(c.contractorId);
  }

  private async contract(projectId: string, userId: string, contractId: string) {
    const w = await this.who(projectId, userId);
    const c = await this.prisma.projectContract.findFirst({
      where: { id: contractId, projectId },
      include: { contractor: { select: { id: true, name: true } }, costPlan: { select: { id: true, number: true, items: { orderBy: { sortOrder: 'asc' }, select: { id: true, ref: true, description: true, unit: true, quantity: true, rate: true, amount: true } } } } },
    });
    if (!c) throw new NotFoundException('Contract not found');
    const measures = this.measures(w, c);
    const contractor = this.isContractor(w, c);
    if (!measures && !contractor) throw new NotFoundException('Contract not found');
    return { w, c, measures, contractor };
  }

  /** The contracts this person measures or is the contractor on: the
   * screen's contract picker. */
  async contracts(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.projectContract.findMany({ where: { projectId }, include: { contractor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
    return rows
      .filter((c) => this.measures(w, c) || this.isContractor(w, c))
      .map((c) => ({ id: c.id, title: c.title, contractor: c.contractor, measured: c.measured, currency: c.currency, reviewerRole: c.reviewerRole, canMeasure: this.measures(w, c), isContractor: this.isContractor(w, c) }));
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, entityId: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'PROJECT', entityId: projectId, message, link: `/projects/${projectId}?tab=measure&contract=${entityId}` });
    }
  }

  private async contractorUsers(projectId: string, contractorId: string) {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, role: 'CONTRACTOR', contractorId, userId: { not: null } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async measurerUsers(projectId: string, c: { reviewerRole: string }) {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['QUANTITY_SURVEYOR', 'PROJECT_MANAGER', ...holdersOf(c.reviewerRole as never)] }, userId: { not: null } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  // ---- Site measurement ------------------------------------------------------

  /** Each bill item with what has been measured and agreed so far. */
  async measurements(projectId: string, userId: string, contractId: string) {
    const { c, measures, contractor } = await this.contract(projectId, userId, contractId);
    const rows = await this.prisma.siteMeasurement.findMany({
      where: { contractId },
      include: { recordedBy: PERSON, respondedBy: PERSON, costPlanItem: { select: { id: true, ref: true, description: true, unit: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const items = (c.costPlan?.items ?? [])
      .filter((i) => i.quantity != null)
      .map((i) => {
        const mine = rows.filter((m) => m.costPlanItemId === i.id);
        const agreed = round(mine.filter((m) => m.status === 'AGREED').reduce((s, m) => s + m.quantity, 0));
        return { ...i, measured: round(mine.filter((m) => m.status !== 'DISPUTED').reduce((s, m) => s + m.quantity, 0)), agreed, overBill: i.quantity != null && agreed > i.quantity };
      });
    return {
      contract: { id: c.id, title: c.title, contractor: c.contractor, measured: c.measured, currency: c.currency },
      can: { measure: measures, respond: contractor || measures },
      items,
      measurements: rows,
    };
  }

  async record(projectId: string, userId: string, contractId: string, dto: CreateMeasurementDto) {
    const { c, measures } = await this.contract(projectId, userId, contractId);
    if (!measures) throw new ForbiddenException('The QS, Setjeka or the engineer named on the contract records measurements');
    if (!c.measured) throw new BadRequestException('This contract is not a measured contract');
    if (!c.costPlan?.items.some((i) => i.id === dto.costPlanItemId)) throw new BadRequestException('That item is not on the contract bill');
    const m = await this.prisma.siteMeasurement.create({
      data: { projectId, contractId, costPlanItemId: dto.costPlanItemId, date: new Date(dto.date), location: dto.location?.trim() || null, quantity: dto.quantity, notes: dto.notes?.trim() || null, recordedById: userId },
      include: { costPlanItem: { select: { description: true, unit: true } } },
    });
    await this.tell(projectId, await this.contractorUsers(projectId, c.contractorId), userId, 'MEASUREMENT_RECORDED', contractId, `${c.title}: ${m.quantity} ${m.costPlanItem.unit ?? ''} of "${m.costPlanItem.description.slice(0, 60)}" measured - agree or dispute it`);
    return this.measurements(projectId, userId, contractId);
  }

  private async measurement(contractId: string, id: string) {
    const m = await this.prisma.siteMeasurement.findFirst({ where: { id, contractId }, include: { costPlanItem: { select: { description: true } } } });
    if (!m) throw new NotFoundException('Measurement not found');
    return m;
  }

  /** The contractor agrees a measurement (Setjeka can record agreement made
   * on site), or disputes it with a reason. */
  async respond(projectId: string, userId: string, contractId: string, id: string, agree: boolean, reason?: string) {
    const { w, c, contractor } = await this.contract(projectId, userId, contractId);
    if (!contractor && !w.internal) throw new ForbiddenException('The contractor agrees or disputes a measurement');
    const m = await this.measurement(contractId, id);
    if (m.status !== 'RECORDED') throw new BadRequestException(`This measurement is already ${m.status.toLowerCase()}`);
    if (!agree && !reason?.trim()) throw new BadRequestException('Say why the measurement is disputed');
    await this.prisma.siteMeasurement.update({ where: { id }, data: { status: agree ? 'AGREED' : 'DISPUTED', respondedById: userId, respondedAt: new Date(), disputeReason: agree ? null : reason!.trim() } });
    if (!agree) await this.tell(projectId, [m.recordedById], userId, 'MEASUREMENT_DISPUTED', contractId, `${c.title}: the measurement of "${m.costPlanItem.description.slice(0, 60)}" is disputed - ${reason!.trim()}`);
    return this.measurements(projectId, userId, contractId);
  }

  async removeMeasurement(projectId: string, userId: string, contractId: string, id: string) {
    const { measures } = await this.contract(projectId, userId, contractId);
    if (!measures) throw new ForbiddenException('Only whoever measures can remove a measurement');
    const m = await this.measurement(contractId, id);
    if (m.status === 'AGREED') throw new BadRequestException('An agreed measurement stays on the record; record a correction instead');
    await this.prisma.siteMeasurement.delete({ where: { id } });
    return this.measurements(projectId, userId, contractId);
  }

  // ---- Dayworks ----------------------------------------------------------------

  async dayworks(projectId: string, userId: string, contractId: string) {
    const { c, measures, contractor } = await this.contract(projectId, userId, contractId);
    const rows = await this.prisma.dayworkSheet.findMany({ where: { contractId }, include: { submittedBy: PERSON, decidedBy: PERSON }, orderBy: { sequence: 'desc' } });
    return {
      contract: { id: c.id, title: c.title, contractor: c.contractor, currency: c.currency },
      can: { submit: contractor || measures, sign: measures },
      signedTotal: round(rows.filter((r) => r.status === 'SIGNED').reduce((s, r) => s + r.total, 0)),
      sheets: rows,
    };
  }

  async submitDaywork(projectId: string, userId: string, contractId: string, dto: CreateDayworkDto) {
    const { c, measures, contractor } = await this.contract(projectId, userId, contractId);
    if (!contractor && !measures) throw new ForbiddenException('The contractor submits daywork sheets');
    const last = await this.prisma.dayworkSheet.findFirst({ where: { contractId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const total = round((dto.labour ?? 0) + (dto.plant ?? 0) + (dto.materials ?? 0));
    if (total <= 0) throw new BadRequestException('Give the labour, plant or materials the daywork cost');
    const d = await this.prisma.dayworkSheet.create({
      data: { projectId, contractId, sequence, number: `DW-${String(sequence).padStart(3, '0')}`, date: new Date(dto.date), description: dto.description.trim(), labour: dto.labour ?? 0, plant: dto.plant ?? 0, materials: dto.materials ?? 0, total, submittedById: userId },
    });
    await this.tell(projectId, await this.measurerUsers(projectId, c), userId, 'DAYWORK_SUBMITTED', contractId, `${c.title}: daywork sheet ${d.number} (${c.currency} ${total.toLocaleString('en-ZA')}) is waiting to be signed`);
    return this.dayworks(projectId, userId, contractId);
  }

  /** Signed, the sheet is paid in the next valuation; rejected, it isn't. */
  async decideDaywork(projectId: string, userId: string, contractId: string, id: string, sign: boolean, note?: string) {
    const { c, measures } = await this.contract(projectId, userId, contractId);
    if (!measures) throw new ForbiddenException('The QS, Setjeka or the engineer named on the contract signs daywork sheets');
    const d = await this.prisma.dayworkSheet.findFirst({ where: { id, contractId } });
    if (!d) throw new NotFoundException('Daywork sheet not found');
    if (d.status !== 'SUBMITTED') throw new BadRequestException(`This daywork sheet is already ${d.status.toLowerCase()}`);
    if (!sign && !note?.trim()) throw new BadRequestException('Say why the daywork sheet is rejected');
    await this.prisma.dayworkSheet.update({ where: { id }, data: { status: sign ? 'SIGNED' : 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    await this.tell(projectId, [d.submittedById], userId, 'DAYWORK_DECIDED', contractId, `${c.title}: daywork sheet ${d.number} was ${sign ? 'signed' : `rejected - ${note!.trim()}`}`);
    return this.dayworks(projectId, userId, contractId);
  }
}
