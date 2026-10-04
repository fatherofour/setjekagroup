import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseFields } from '../inception/register-fields.js';
import { computeViability } from '../inception/viability.js';
import { isExecutive } from '../auth/executive.js';
import { MILESTONE_TEMPLATE, markMilestone, milestoneStatus } from './milestones.js';
import { OPPORTUNITY_REGISTERS, type OpportunityRegisterConfig } from './opportunity-registers.js';

type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
  delete(args: unknown): Promise<unknown>;
};

/** Stage 0 registers on an opportunity: first business case (0.2), market
 * research (0.6), creditor payments (0.8) and development milestones. */
@Injectable()
export class OpportunityRegistersService {
  constructor(private readonly prisma: PrismaService) {}

  private config(register: string): OpportunityRegisterConfig {
    const config = OPPORTUNITY_REGISTERS[register];
    if (!config) throw new NotFoundException('Unknown register');
    return config;
  }

  private delegate(config: OpportunityRegisterConfig) {
    return this.prisma[config.model] as unknown as Delegate;
  }

  private decorate(register: string, row: Row) {
    if (register === 'business-cases') return { ...row, result: computeViability(row as never) };
    if (register === 'milestones') return { ...row, ...milestoneStatus(row as never) };
    return row;
  }

  private async opportunity(opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return opportunity;
  }

  /** Once converted, the Stage 0 record is frozen — except payments, since a
   * late Stage 0 invoice still has to be paid. (Milestones carry on from the
   * project's Inception tab.) */
  private assertEditable(opportunity: { stage: string }, register: string) {
    if (opportunity.stage === 'CONVERTED' && register !== 'payments') {
      throw new BadRequestException('This opportunity has been converted; its Stage 0 record is read-only');
    }
  }

  async findAll(opportunityId: string, register: string) {
    const config = this.config(register);
    await this.opportunity(opportunityId);
    const rows = await this.delegate(config).findMany({ where: { opportunityId }, include: config.include, orderBy: config.orderBy });
    return rows.map((r) => this.decorate(register, r));
  }

  private async findOne(opportunityId: string, register: string, id: string) {
    const config = this.config(register);
    const row = await this.delegate(config).findFirst({ where: { id, opportunityId }, include: config.include });
    if (!row) throw new NotFoundException('Record not found');
    return this.decorate(register, row);
  }

  private async assertRefs(opportunityId: string, config: OpportunityRegisterConfig, data: Record<string, unknown>) {
    for (const [name, spec] of Object.entries(config.fields)) {
      const id = data[name];
      if (typeof id !== 'string') continue;
      if (spec.type === 'contractor' && !(await this.prisma.contractor.count({ where: { id } }))) {
        throw new BadRequestException(`${name}: contractor not found`);
      }
      if (spec.type === 'appointment' && !(await this.prisma.opportunityAppointment.count({ where: { id, opportunityId } }))) {
        throw new BadRequestException(`${name}: appointment not found on this opportunity`);
      }
    }
  }

  async create(opportunityId: string, register: string, userId: string, body: unknown) {
    const config = this.config(register);
    const opportunity = await this.opportunity(opportunityId);
    this.assertEditable(opportunity, register);
    const data = parseFields(config.fields, body, 'create');
    await this.assertRefs(opportunityId, config, data);
    if (config.createdByField) data[config.createdByField] = userId;
    if (register === 'payments' && !data.contractorId && !data.payeeName) {
      throw new BadRequestException('Say who is being paid: a registered firm or a payee name');
    }
    if (register === 'milestones') {
      const max = await this.prisma.developmentMilestone.aggregate({ where: { opportunityId }, _max: { sortOrder: true } });
      data.sortOrder = (max._max.sortOrder ?? 0) + 1;
    }
    const created = await this.delegate(config).create({ data: { ...data, opportunityId } });
    await this.afterChange(opportunityId, register, created.id);
    return this.findOne(opportunityId, register, created.id);
  }

  async update(opportunityId: string, register: string, id: string, body: unknown) {
    const config = this.config(register);
    const opportunity = await this.opportunity(opportunityId);
    this.assertEditable(opportunity, register);
    const existing = await this.findOne(opportunityId, register, id);
    if (register === 'payments' && existing.status !== 'INVOICED') {
      throw new BadRequestException('An approved or paid payment can no longer be edited');
    }
    const data = parseFields(config.fields, body, 'update');
    await this.assertRefs(opportunityId, config, data);
    await this.delegate(config).update({ where: { id }, data });
    await this.afterChange(opportunityId, register, id);
    return this.findOne(opportunityId, register, id);
  }

  async remove(opportunityId: string, register: string, id: string) {
    const config = this.config(register);
    const opportunity = await this.opportunity(opportunityId);
    this.assertEditable(opportunity, register);
    const existing = await this.findOne(opportunityId, register, id);
    if (register === 'payments' && existing.status === 'PAID') throw new BadRequestException('A paid payment is kept as the record of payment');
    await this.delegate(config).delete({ where: { id } });
  }

  private async afterChange(opportunityId: string, register: string, id: string) {
    if (register !== 'market-research') return;
    const r = await this.prisma.marketResearch.findUnique({ where: { id } });
    if (r?.status === 'COMPLETED') await markMilestone(this.prisma, { opportunityId }, 'MARKET_RESEARCH', r.completedAt ?? new Date());
  }

  // ---- Business case (0.2) ----

  async preferBusinessCase(opportunityId: string, id: string) {
    const opportunity = await this.opportunity(opportunityId);
    this.assertEditable(opportunity, 'business-cases');
    await this.findOne(opportunityId, 'business-cases', id);
    await this.prisma.$transaction([
      this.prisma.viabilityScenario.updateMany({ where: { opportunityId, NOT: { id } }, data: { isPreferred: false } }),
      this.prisma.viabilityScenario.update({ where: { id }, data: { isPreferred: true } }),
    ]);
    return this.findAll(opportunityId, 'business-cases');
  }

  // ---- Payments (0.8): Executive approves, then marked paid ----

  async decidePayment(opportunityId: string, id: string, userId: string, approve: boolean, comment?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (!isExecutive(user)) throw new ForbiddenException('Only an Executive (a Setjeka manager) can approve Stage 0 payments');
    const payment = await this.findOne(opportunityId, 'payments', id);
    if (payment.status !== 'INVOICED') throw new BadRequestException('This payment has already been decided');
    if (payment.recordedById === userId) throw new ForbiddenException('A payment must be approved by someone other than the person who recorded it');
    if (!approve && !comment?.trim()) throw new BadRequestException('Give a reason when rejecting a payment');
    await this.prisma.opportunityPayment.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: approve ? userId : null, approvedAt: new Date(), decisionComment: comment?.trim() || null },
    });
    return this.findOne(opportunityId, 'payments', id);
  }

  async markPaid(opportunityId: string, id: string, paymentReference?: string, paidAt?: string) {
    const payment = await this.findOne(opportunityId, 'payments', id);
    if (payment.status !== 'APPROVED') throw new BadRequestException('Only an approved payment can be marked paid');
    await this.prisma.opportunityPayment.update({
      where: { id },
      data: { status: 'PAID', paymentReference: paymentReference?.trim() || null, paidAt: paidAt ? new Date(paidAt) : new Date() },
    });
    return this.findOne(opportunityId, 'payments', id);
  }

  // ---- Milestones (register DEV R12) ----

  async addMilestoneTemplate(opportunityId: string) {
    const opportunity = await this.opportunity(opportunityId);
    this.assertEditable(opportunity, 'milestones');
    const existing = await this.prisma.developmentMilestone.findMany({ where: { opportunityId }, select: { key: true } });
    const have = new Set(existing.map((m) => m.key));
    const max = await this.prisma.developmentMilestone.aggregate({ where: { opportunityId }, _max: { sortOrder: true } });
    let sort = (max._max.sortOrder ?? 0) + 1;
    await this.prisma.developmentMilestone.createMany({
      data: MILESTONE_TEMPLATE.filter((t) => !have.has(t.key)).map((t) => ({ opportunityId, key: t.key, name: t.name, sortOrder: sort++ })),
    });
    // Catch up anything that already happened.
    if (opportunity.visionConfirmedAt) await markMilestone(this.prisma, { opportunityId }, 'CLIENT_VISION', opportunity.visionConfirmedAt);
    const research = await this.prisma.marketResearch.findFirst({ where: { opportunityId, status: 'COMPLETED' }, orderBy: { completedAt: 'asc' } });
    if (research) await markMilestone(this.prisma, { opportunityId }, 'MARKET_RESEARCH', research.completedAt ?? research.updatedAt);
    const decision = await this.prisma.investmentDecision.findFirst({ where: { opportunityId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
    if (decision?.decidedAt) await markMilestone(this.prisma, { opportunityId }, 'INVESTMENT_DECISION', decision.decidedAt);
    return this.findAll(opportunityId, 'milestones');
  }

  /** Fixes the current targets as the baseline for any milestone without
   * one; later target changes then show as slippage. */
  async baselineMilestones(opportunityId: string) {
    const rows = await this.prisma.developmentMilestone.findMany({ where: { opportunityId, baselineDate: null, targetDate: { not: null } } });
    await this.prisma.$transaction(rows.map((m) => this.prisma.developmentMilestone.update({ where: { id: m.id }, data: { baselineDate: m.targetDate } })));
    return this.findAll(opportunityId, 'milestones');
  }
}
