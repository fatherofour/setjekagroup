import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Currency, VariationStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CostDatabaseService } from '../cost-database/cost-database.service.js';
import { round } from '../cost-database/pricing.js';
import type {
  AssessVariationDto,
  BudgetLineDto,
  CreateInvoiceDto,
  CreateVariationDto,
  DecideVariationDto,
  PayInvoiceDto,
  RejectInvoiceDto,
  UpdateBudgetDto,
  UpdateBudgetLineDto,
  UpdateInvoiceDto,
  UpdateVariationDto,
} from './dto/commercial.dto.js';

const CODE = { select: { id: true, code: true, name: true } } as const;
const PERSON = { select: { fullName: true } } as const;
const VARIATION_INCLUDE = {
  costCode: CODE,
  rfi: { select: { id: true, rfiNumber: true, title: true } },
  raisedBy: PERSON,
  assessedBy: PERSON,
  decidedBy: PERSON,
  events: { include: { actor: PERSON }, orderBy: { createdAt: 'asc' as const } },
} as const;
const INVOICE_INCLUDE = {
  purchaseOrder: { select: { id: true, poNumber: true, value: true, currency: true, contractor: { select: { name: true } } } },
  recordedBy: PERSON,
  approvedBy: PERSON,
} as const;

// Roles whose appointment is a professional-fee commitment (cost code 20).
const CONTRACTING_ROLES = ['MAIN_CONTRACTOR', 'SUBCONTRACTOR', 'SUPPLIER', 'CLIENT'];

/** The value a variation carries: the QS's assessment once there is one. */
const variationValue = (v: { assessedValue: number | null; estimatedValue: number }) => v.assessedValue ?? v.estimatedValue;

/** Project commercial control: the budget and its contingency, variations
 * (approved by the client alone), supplier invoices against orders, and a
 * cost report of budget vs committed vs invoiced vs forecast. Monitoring
 * only - the QS keeps the cost system of record (Meeting 002, 2.4). */
@Injectable()
export class CommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly costs: CostDatabaseService,
  ) {}

  private async project(projectId: string) {
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, currency: true, contingencyPct: true } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  // ---- Budget ---------------------------------------------------------------

  async getBudget(projectId: string) {
    const project = await this.project(projectId);
    const [budget, lines] = await Promise.all([
      this.prisma.projectBudget.findUnique({ where: { projectId }, include: { lockedBy: PERSON, sourceEstimate: { select: { id: true, reference: true, name: true } } } }),
      this.prisma.budgetLine.findMany({ where: { projectId }, include: { costCode: CODE }, orderBy: [{ costCode: { sortOrder: 'asc' } }, { createdAt: 'asc' }] }),
    ]);
    const total = lines.reduce((s, l) => s + l.amount, 0);
    return {
      currency: project.currency,
      contingencyPctGuide: project.contingencyPct,
      budget,
      lines,
      total: round(total),
      contingency: budget?.contingencyAmount ?? 0,
      totalWithContingency: round(total + (budget?.contingencyAmount ?? 0)),
    };
  }

  private async budgetRow(projectId: string) {
    return this.prisma.projectBudget.upsert({ where: { projectId }, update: {}, create: { projectId } });
  }

  private async assertUnlocked(projectId: string) {
    const b = await this.prisma.projectBudget.findUnique({ where: { projectId } });
    if (b?.lockedAt) throw new BadRequestException('The budget is locked. Changes now come through variations, or unlock it first.');
  }

  async updateBudget(projectId: string, dto: UpdateBudgetDto) {
    await this.project(projectId);
    if (dto.contingencyAmount !== undefined) await this.assertUnlocked(projectId);
    await this.budgetRow(projectId);
    await this.prisma.projectBudget.update({ where: { projectId }, data: dto });
    return this.getBudget(projectId);
  }

  private async assertCode(costCodeId: string) {
    if (!(await this.prisma.costCode.findUnique({ where: { id: costCodeId } }))) throw new BadRequestException('Cost code not found');
  }

  async addBudgetLine(projectId: string, dto: BudgetLineDto) {
    await this.project(projectId);
    await this.assertUnlocked(projectId);
    await this.assertCode(dto.costCodeId);
    await this.budgetRow(projectId);
    await this.prisma.budgetLine.create({ data: { ...dto, projectId } });
    return this.getBudget(projectId);
  }

  async updateBudgetLine(projectId: string, lineId: string, dto: UpdateBudgetLineDto) {
    await this.assertUnlocked(projectId);
    if (!(await this.prisma.budgetLine.findFirst({ where: { id: lineId, projectId } }))) throw new NotFoundException('Budget line not found');
    if (dto.costCodeId) await this.assertCode(dto.costCodeId);
    await this.prisma.budgetLine.update({ where: { id: lineId }, data: dto });
    return this.getBudget(projectId);
  }

  async removeBudgetLine(projectId: string, lineId: string) {
    await this.assertUnlocked(projectId);
    if (!(await this.prisma.budgetLine.findFirst({ where: { id: lineId, projectId } }))) throw new NotFoundException('Budget line not found');
    await this.prisma.budgetLine.delete({ where: { id: lineId } });
    return this.getBudget(projectId);
  }

  async lockBudget(projectId: string, userId: string, lock: boolean) {
    await this.project(projectId);
    if (lock && !(await this.prisma.budgetLine.count({ where: { projectId } }))) throw new BadRequestException('Add budget lines before locking the budget');
    await this.budgetRow(projectId);
    await this.prisma.projectBudget.update({ where: { projectId }, data: lock ? { lockedAt: new Date(), lockedById: userId } : { lockedAt: null, lockedById: null } });
    return this.getBudget(projectId);
  }

  // ---- Variations -----------------------------------------------------------

  listVariations(projectId: string) {
    return this.prisma.variation.findMany({ where: { projectId }, include: VARIATION_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  private async variation(projectId: string, id: string) {
    const v = await this.prisma.variation.findFirst({ where: { id, projectId }, include: VARIATION_INCLUDE });
    if (!v) throw new NotFoundException('Variation not found');
    return v;
  }

  private async nextVariationNumber(projectId: string) {
    const rows = await this.prisma.variation.findMany({ where: { projectId }, select: { number: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r.number.replace(/\D/g, ''), 10) || 0), 0);
    return `VO-${String(max + 1).padStart(3, '0')}`;
  }

  private async checkLinks(projectId: string, dto: { rfiId?: string | null; costCodeId?: string | null }) {
    if (dto.rfiId && !(await this.prisma.rfi.findFirst({ where: { id: dto.rfiId, projectId } }))) throw new BadRequestException('RFI not found on this project');
    if (dto.costCodeId) await this.assertCode(dto.costCodeId);
  }

  async createVariation(projectId: string, userId: string, dto: CreateVariationDto) {
    await this.project(projectId);
    await this.checkLinks(projectId, dto);
    const number = await this.nextVariationNumber(projectId);
    const v = await this.prisma.variation.create({
      data: {
        ...dto,
        reason: dto.reason ?? (dto.rfiId ? 'RFI' : undefined),
        title: dto.title.trim(),
        projectId,
        number,
        raisedById: userId,
        events: { create: { toStatus: 'DRAFT', actorId: userId, comment: 'Raised' } },
      },
    });
    return this.variation(projectId, v.id);
  }

  async updateVariation(projectId: string, id: string, dto: UpdateVariationDto) {
    const v = await this.variation(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Only a draft variation can be edited. Withdraw it and raise a new one.');
    await this.checkLinks(projectId, dto);
    await this.prisma.variation.update({ where: { id }, data: dto });
    return this.variation(projectId, id);
  }

  async assessVariation(projectId: string, id: string, userId: string, dto: AssessVariationDto) {
    const v = await this.variation(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Assess the variation before it goes to the client');
    await this.prisma.variation.update({
      where: { id },
      data: {
        assessedValue: dto.assessedValue,
        assessedById: userId,
        assessedAt: new Date(),
        events: { create: { fromStatus: 'DRAFT', toStatus: 'DRAFT', actorId: userId, comment: `Assessed at ${dto.assessedValue}${dto.comment ? ` — ${dto.comment}` : ''}` } },
      },
    });
    return this.variation(projectId, id);
  }

  private async transition(projectId: string, id: string, userId: string, from: VariationStatus[], to: VariationStatus, comment: string | undefined, extra: object = {}) {
    const v = await this.variation(projectId, id);
    if (!from.includes(v.status)) throw new BadRequestException(`A ${v.status.toLowerCase()} variation can't be moved to ${to.toLowerCase()}`);
    await this.prisma.variation.update({
      where: { id },
      data: { ...extra, status: to, events: { create: { fromStatus: v.status, toStatus: to, actorId: userId, comment } } },
    });
    return v;
  }

  async submitVariation(projectId: string, id: string, userId: string, comment?: string) {
    const v = await this.transition(projectId, id, userId, ['DRAFT'], 'SUBMITTED', comment, { submittedAt: new Date() });
    const project = await this.project(projectId);
    const clients = await this.prisma.projectMember.findMany({ where: { projectId, role: 'CLIENT', userId: { not: null } }, select: { userId: true } });
    for (const c of clients) {
      await this.notifications.notify({
        userId: c.userId,
        projectId,
        type: 'VARIATION_SUBMITTED',
        entityType: 'VARIATION',
        entityId: id,
        message: `${project.name}: variation ${v.number} "${v.title}" (${project.currency} ${variationValue(v).toLocaleString('en-ZA')}) is waiting for your decision`,
      });
    }
    return this.variation(projectId, id);
  }

  async withdrawVariation(projectId: string, id: string, userId: string, comment?: string) {
    await this.transition(projectId, id, userId, ['DRAFT', 'SUBMITTED'], 'WITHDRAWN', comment);
    return this.variation(projectId, id);
  }

  /** Meeting 3 hard rule: only the client decides. Checked here directly,
   * not just through the permission matrix, so neither an admin nor a
   * changed matrix can let Setjeka approve on the client's behalf. */
  async decideVariation(projectId: string, id: string, userId: string, dto: DecideVariationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    const asClient = await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } });
    if (!asClient || user?.accountType !== 'EXTERNAL') throw new ForbiddenException('Only the client can approve or reject a variation');
    if (!dto.approve && !dto.comment?.trim()) throw new BadRequestException('Say why the variation is rejected');
    const v = await this.transition(projectId, id, userId, ['SUBMITTED'], dto.approve ? 'APPROVED' : 'REJECTED', dto.comment, {
      decidedById: userId,
      decidedAt: new Date(),
      decisionComment: dto.comment,
    });
    await this.notifications.notify({
      userId: v.raisedById,
      projectId,
      type: 'VARIATION_DECIDED',
      entityType: 'VARIATION',
      entityId: id,
      message: `Variation ${v.number} "${v.title}" was ${dto.approve ? 'approved' : 'rejected'} by the client${dto.comment ? `: ${dto.comment}` : ''}`,
    });
    return this.variation(projectId, id);
  }

  async removeVariation(projectId: string, id: string) {
    const v = await this.variation(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Only a draft variation can be deleted; withdraw it instead');
    await this.prisma.variation.delete({ where: { id } });
  }

  // ---- Supplier invoices ----------------------------------------------------

  /** Each order with its value, invoiced, paid and outstanding balance. */
  async listInvoices(projectId: string) {
    await this.project(projectId);
    const [invoices, orders] = await Promise.all([
      this.prisma.supplierInvoice.findMany({ where: { projectId }, include: INVOICE_INCLUDE, orderBy: { invoiceDate: 'desc' } }),
      this.prisma.purchaseOrder.findMany({
        where: { projectId, status: { in: ['APPROVED', 'ISSUED'] } },
        select: { id: true, poNumber: true, value: true, currency: true, status: true, contractor: { select: { name: true } }, invoices: { select: { amount: true, status: true } } },
        orderBy: { poNumber: 'asc' },
      }),
    ]);
    return {
      invoices,
      orders: orders.map(({ invoices: inv, ...o }) => {
        const invoiced = inv.filter((i) => i.status !== 'REJECTED').reduce((s, i) => s + i.amount, 0);
        const paid = inv.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
        return { ...o, invoiced: round(invoiced), paid: round(paid), remainingToInvoice: round(o.value - invoiced), outstanding: round(invoiced - paid) };
      }),
    };
  }

  private async invoice(projectId: string, id: string) {
    const i = await this.prisma.supplierInvoice.findFirst({ where: { id, projectId }, include: INVOICE_INCLUDE });
    if (!i) throw new NotFoundException('Invoice not found');
    return i;
  }

  /** Refuse an invoice that would take the order past its value - no
   * supplier is overpaid (Meeting 002, 2.8). */
  private async assertWithinOrder(purchaseOrderId: string, amount: number, excludeInvoiceId?: string) {
    const po = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, include: { invoices: { where: { status: { not: 'REJECTED' } } } } });
    const already = po.invoices.filter((i) => i.id !== excludeInvoiceId).reduce((s, i) => s + i.amount, 0);
    if (already + amount > po.value + 0.005) {
      throw new BadRequestException(
        `This takes ${po.poNumber} to ${po.currency} ${round(already + amount).toLocaleString('en-ZA')}, over its value of ${po.currency} ${po.value.toLocaleString('en-ZA')}. Only ${po.currency} ${round(po.value - already).toLocaleString('en-ZA')} remains to invoice.`,
      );
    }
  }

  async createInvoice(projectId: string, userId: string, dto: CreateInvoiceDto) {
    await this.project(projectId);
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, projectId } });
    if (!po) throw new BadRequestException('Purchase order not found on this project');
    if (po.status !== 'APPROVED' && po.status !== 'ISSUED') throw new BadRequestException('Invoices can only be recorded against an approved or issued order');
    if (await this.prisma.supplierInvoice.findFirst({ where: { purchaseOrderId: po.id, invoiceNumber: dto.invoiceNumber.trim() } })) {
      throw new BadRequestException(`Invoice ${dto.invoiceNumber} is already recorded against ${po.poNumber}`);
    }
    await this.assertWithinOrder(po.id, dto.amount);
    const inv = await this.prisma.supplierInvoice.create({
      data: { ...dto, invoiceNumber: dto.invoiceNumber.trim(), invoiceDate: new Date(dto.invoiceDate), projectId, recordedById: userId },
    });
    return this.invoice(projectId, inv.id);
  }

  async updateInvoice(projectId: string, id: string, dto: UpdateInvoiceDto) {
    const inv = await this.invoice(projectId, id);
    if (inv.status !== 'RECEIVED') throw new BadRequestException('Only an invoice that is not yet approved can be edited');
    if (dto.amount !== undefined) await this.assertWithinOrder(inv.purchaseOrderId, dto.amount, id);
    await this.prisma.supplierInvoice.update({ where: { id }, data: { ...dto, invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined } });
    return this.invoice(projectId, id);
  }

  async approveInvoice(projectId: string, id: string, userId: string) {
    const inv = await this.invoice(projectId, id);
    if (inv.status !== 'RECEIVED') throw new BadRequestException('Only a received invoice can be approved');
    if (inv.recordedById === userId) throw new ForbiddenException('Someone other than the person who recorded the invoice must approve it');
    await this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() } });
    return this.invoice(projectId, id);
  }

  async payInvoice(projectId: string, id: string, dto: PayInvoiceDto) {
    const inv = await this.invoice(projectId, id);
    if (inv.status !== 'APPROVED') throw new BadRequestException('Approve the invoice before marking it paid');
    await this.prisma.supplierInvoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), paymentReference: dto.paymentReference.trim() },
    });
    return this.invoice(projectId, id);
  }

  async rejectInvoice(projectId: string, id: string, dto: RejectInvoiceDto) {
    const inv = await this.invoice(projectId, id);
    if (inv.status === 'PAID') throw new BadRequestException('A paid invoice cannot be rejected');
    await this.prisma.supplierInvoice.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: dto.reason.trim() } });
    return this.invoice(projectId, id);
  }

  async removeInvoice(projectId: string, id: string) {
    const inv = await this.invoice(projectId, id);
    if (inv.status !== 'RECEIVED') throw new BadRequestException('Only an invoice that is not yet approved can be deleted');
    await this.prisma.supplierInvoice.delete({ where: { id } });
  }

  // ---- Cost report ----------------------------------------------------------

  /** Budget vs committed vs invoiced vs paid vs forecast, by cost code, in
   * the project's currency. Commitments and spend in another currency are
   * converted with Setjeka's recorded FX rates; anything with no rate on
   * file is listed rather than silently added. */
  async summary(projectId: string) {
    const project = await this.project(projectId);
    const to = project.currency as Currency;
    const convert = await this.costs.converter(to);
    const missingFx = new Set<string>();
    const conv = (amount: number, from: Currency) => {
      const v = convert(amount, from);
      if (v == null) missingFx.add(`${from} → ${to}`);
      return v ?? 0;
    };

    const [codes, budget, budgetLines, variations, orders, appointments, invoices] = await Promise.all([
      this.prisma.costCode.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      this.prisma.projectBudget.findUnique({ where: { projectId } }),
      this.prisma.budgetLine.findMany({ where: { projectId } }),
      this.prisma.variation.findMany({ where: { projectId, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } } }),
      this.prisma.purchaseOrder.findMany({ where: { projectId, status: { in: ['APPROVED', 'ISSUED'] } }, select: { id: true, value: true, currency: true, budgetCodeId: true, appointmentId: true } }),
      this.prisma.organisationProjectAppointment.findMany({
        // An indicative Stage 0 pick (PROPOSED) is not a commitment.
        where: { projectId, appointmentStatus: { in: ['APPOINTED', 'ACTIVE', 'COMPLETED'] } },
        select: { id: true, role: true, contractValue: true, currency: true, payments: { select: { amount: true, currency: true } } },
      }),
      this.prisma.supplierInvoice.findMany({ where: { projectId, status: { not: 'REJECTED' } }, select: { amount: true, status: true, purchaseOrder: { select: { currency: true, budgetCodeId: true } } } }),
    ]);

    const feesCode = codes.find((c) => c.code === '20');
    type Row = { costCodeId: string | null; code: string | null; name: string; budget: number; approvedVariations: number; pendingVariations: number; committed: number; invoiced: number; paid: number };
    const rows = new Map<string, Row>();
    const row = (id: string | null) => {
      const key = id ?? '__none__';
      if (!rows.has(key)) {
        const c = codes.find((x) => x.id === id);
        rows.set(key, { costCodeId: id, code: c?.code ?? null, name: c?.name ?? 'Not coded', budget: 0, approvedVariations: 0, pendingVariations: 0, committed: 0, invoiced: 0, paid: 0 });
      }
      return rows.get(key)!;
    };

    for (const l of budgetLines) row(l.costCodeId).budget += l.amount;
    let approvedVar = 0;
    let pendingVar = 0;
    for (const v of variations) {
      const value = variationValue(v);
      if (v.status === 'APPROVED') {
        row(v.costCodeId).approvedVariations += value;
        approvedVar += value;
      } else if (v.status === 'SUBMITTED') {
        row(v.costCodeId).pendingVariations += value;
        pendingVar += value;
      }
    }
    // An order placed under an appointment draws on that appointment, so
    // the appointment's own value only counts when it has no orders.
    const appointmentsWithOrders = new Set(orders.map((o) => o.appointmentId).filter(Boolean));
    for (const o of orders) row(o.budgetCodeId).committed += conv(o.value, o.currency as Currency);
    for (const a of appointments) {
      const code = CONTRACTING_ROLES.includes(a.role) ? null : (feesCode?.id ?? null);
      if (a.contractValue && a.currency && !appointmentsWithOrders.has(a.id)) row(code).committed += conv(a.contractValue, a.currency as Currency);
      for (const p of a.payments) {
        const amt = conv(p.amount, p.currency as Currency);
        row(code).invoiced += amt;
        row(code).paid += amt;
      }
    }
    for (const i of invoices) {
      const amt = conv(i.amount, i.purchaseOrder.currency as Currency);
      row(i.purchaseOrder.budgetCodeId).invoiced += amt;
      if (i.status === 'PAID') row(i.purchaseOrder.budgetCodeId).paid += amt;
    }

    const lines = [...rows.values()]
      .map((r) => {
        const revisedBudget = r.budget + r.approvedVariations;
        const forecastFinal = Math.max(revisedBudget, r.committed);
        return {
          ...r,
          revisedBudget,
          forecastFinal,
          variance: revisedBudget - forecastFinal,
        };
      })
      .sort((a, b) => (a.code ?? 'zz').localeCompare(b.code ?? 'zz'))
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])) as typeof r);

    const sum = (k: keyof (typeof lines)[number]) => round(lines.reduce((s, l) => s + (l[k] as number), 0));
    const contingency = budget?.contingencyAmount ?? 0;
    return {
      currency: to,
      budgetLocked: Boolean(budget?.lockedAt),
      lines,
      totals: {
        budget: sum('budget'),
        approvedVariations: sum('approvedVariations'),
        pendingVariations: sum('pendingVariations'),
        revisedBudget: sum('revisedBudget'),
        committed: sum('committed'),
        invoiced: sum('invoiced'),
        paid: sum('paid'),
        forecastFinal: sum('forecastFinal'),
        variance: sum('variance'),
      },
      // Approved variations draw the contingency down; omissions return to
      // it (Meeting 002, 2.5).
      contingency: {
        original: round(contingency),
        drawn: round(approvedVar),
        remaining: round(contingency - approvedVar),
        pendingExposure: round(pendingVar),
        remainingIfPendingApproved: round(contingency - approvedVar - pendingVar),
      },
      projectedFinalCost: round(sum('forecastFinal') + Math.max(contingency - approvedVar, 0)),
      missingFx: [...missingFx],
    };
  }
}
