import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { round } from '../cost-database/pricing.js';
import { QsAccessService } from './qs-access.service.js';
import { sCurve } from './qs-math.js';
import { contractTerms } from '../common/contract-forms.js';

/** The form's terms with this contract's own periods where it has them. */
export function termsFor(c: { contractForm: Parameters<typeof contractTerms>[0]; certifyWithinDays: number | null; payWithinDays: number | null }) {
  const t = contractTerms(c.contractForm);
  return { ...t, certifyWithinDays: c.certifyWithinDays ?? t.certifyWithinDays, payWithinDays: c.payWithinDays ?? t.payWithinDays };
}
import type { CashFlowDto, ContractFromAwardDto, CreateContractDto, FinalAccountActionDto, UpdateContractDto } from './dto/qs.dto.js';

const CERTIFIED = ['CERTIFIED', 'APPROVED', 'PAID'] as const;
const PERSON = { select: { fullName: true } } as const;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const cashFlowRef = (contractId: string) => `contract:${contractId}`;

/** The contracts the QS values (QS 4.7, 5.2, 5.9, 6.2): the contract sum and
 * retention terms, valuations against it, and its final account. */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QsAccessService,
  ) {}

  private async contract(projectId: string, id: string) {
    const c = await this.prisma.projectContract.findFirst({ where: { id, projectId }, include: { contractor: { select: { id: true, name: true } } } });
    if (!c) throw new NotFoundException('Contract not found');
    return c;
  }

  /** Where the contract stands: certified and paid to date, retention held,
   * approved variations and agreed claims. */
  private async standing(projectId: string, c: { id: string; contractorId: string }) {
    const [valuations, variations, claims] = await Promise.all([
      this.prisma.valuation.findMany({ where: { contractId: c.id }, orderBy: { number: 'asc' }, select: { number: true, status: true, grossValuation: true, retention: true, cumulativeNet: true, amountDue: true, isFinal: true } }),
      this.prisma.variation.findMany({ where: { contractId: c.id, status: { in: ['APPROVED', 'SUBMITTED'] } }, select: { status: true, assessedValue: true, estimatedValue: true } }),
      this.prisma.projectRegisterEntry.findMany({ where: { projectId, register: 'claims', contractorId: c.contractorId }, select: { status: true, amount: true, amount2: true } }),
    ]);
    const last = [...valuations].reverse().find((v) => (CERTIFIED as readonly string[]).includes(v.status));
    const value = (v: { assessedValue: number | null; estimatedValue: number }) => v.assessedValue ?? v.estimatedValue;
    return {
      valuations: valuations.length,
      openValuation: valuations.find((v) => v.status === 'DRAFT' || v.status === 'SUBMITTED' || v.status === 'REJECTED')?.number ?? null,
      certifiedGross: last?.grossValuation ?? 0,
      certifiedNet: last?.cumulativeNet ?? 0,
      retentionHeld: last?.retention ?? 0,
      paid: round(valuations.filter((v) => v.status === 'PAID').reduce((s, v) => s + v.amountDue, 0)),
      approvedVariations: round(variations.filter((v) => v.status === 'APPROVED').reduce((s, v) => s + value(v), 0)),
      pendingVariations: round(variations.filter((v) => v.status === 'SUBMITTED').reduce((s, v) => s + value(v), 0)),
      agreedClaims: round(claims.filter((x) => x.status === 'AGREED').reduce((s, x) => s + (x.amount2 ?? 0), 0)),
      openClaims: round(claims.filter((x) => x.status && ['RECEIVED', 'UNDER_REVIEW', 'RECOMMENDED'].includes(x.status)).reduce((s, x) => s + (x.amount ?? 0), 0)),
      finalCertified: valuations.some((v) => v.isFinal && (CERTIFIED as readonly string[]).includes(v.status)),
    };
  }

  async list(projectId: string, userId: string) {
    const a = await this.access.of(projectId, userId);
    if (!a.internal && !a.qs && !a.client) return [];
    const rows = await this.prisma.projectContract.findMany({
      where: { projectId },
      include: { contractor: { select: { id: true, name: true } }, costPlan: { select: { id: true, number: true, title: true } }, rfq: { select: { id: true, rfqNumber: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map(async (c) => ({ ...c, terms: termsFor(c), standing: await this.standing(projectId, c) })));
  }

  async get(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    if (!a.internal && !a.qs && !a.client) throw new NotFoundException('Contract not found');
    const c = await this.prisma.projectContract.findFirst({
      where: { id, projectId },
      include: { contractor: { select: { id: true, name: true } }, costPlan: { select: { id: true, number: true, title: true } }, rfq: { select: { id: true, rfqNumber: true } }, createdBy: PERSON },
    });
    if (!c) throw new NotFoundException('Contract not found');
    return { ...c, terms: termsFor(c), standing: await this.standing(projectId, c) };
  }

  private async checkPlan(projectId: string, costPlanId?: string | null) {
    if (costPlanId && !(await this.prisma.costPlan.findFirst({ where: { id: costPlanId, projectId } }))) throw new BadRequestException('That bill is not on this project');
  }

  private async checkContractor(projectId: string, contractorId: string) {
    const onProject = await this.prisma.projectMember.findFirst({ where: { projectId, contractorId } });
    const known = onProject || (await this.prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } }));
    if (!known) throw new BadRequestException('Contractor not found');
  }

  async create(projectId: string, userId: string, dto: CreateContractDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    await this.checkContractor(projectId, dto.contractorId);
    await this.checkPlan(projectId, dto.costPlanId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true, contractForm: true } });
    const c = await this.prisma.projectContract.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        projectId,
        currency: dto.currency ?? project.currency,
        contractForm: dto.contractForm ?? project.contractForm,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
        createdById: userId,
      },
    });
    return this.get(projectId, userId, c.id);
  }

  /** The contract from an awarded tender (QS 4.7): the winner's prices
   * become the priced contract bill, and the contract sum is their total. */
  async fromAward(projectId: string, userId: string, dto: ContractFromAwardDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: dto.rfqId, projectId },
      include: {
        awardedQuote: { include: { contractor: { select: { id: true, name: true } }, items: true } },
        items: { include: { costPlanItem: true }, orderBy: { sortOrder: 'asc' } },
        costPlan: true,
      },
    });
    if (!rfq) throw new NotFoundException('Tender not found');
    if (rfq.status !== 'AWARDED' || !rfq.awardedQuote) throw new BadRequestException('The tender has not been awarded yet');
    if (await this.prisma.projectContract.findFirst({ where: { rfqId: rfq.id } })) throw new BadRequestException('A contract already exists for this tender');
    const q = rfq.awardedQuote;
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true, contractForm: true } });

    let costPlanId: string | null = null;
    if (rfq.costPlan && rfq.items.length) {
      const rows = await this.prisma.costPlan.findMany({ where: { projectId }, select: { number: true } });
      const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r.number.replace(/\D/g, ''), 10) || 0), 0);
      const plan = await this.prisma.costPlan.create({
        data: {
          projectId,
          number: `BQ-${String(max + 1).padStart(3, '0')}`,
          title: `${rfq.title}: ${q.contractor.name} (contract)`,
          kind: 'CONTRACT_BOQ',
          status: 'ACCEPTED',
          currency: q.currency,
          vatPct: rfq.costPlan.vatPct,
          preparedById: userId,
          acceptedById: a.internal ? userId : null,
          acceptedAt: a.internal ? new Date() : null,
          notes: `Priced by ${q.contractor.name} in ${rfq.rfqNumber}`,
          items: {
            create: rfq.items.map((ri, k) => {
              const src = ri.costPlanItem;
              const rate = q.items.find((qi) => qi.rfqItemId === ri.id)?.unitRate ?? null;
              const quantity = src?.quantity ?? ri.quantity;
              return {
                sortOrder: k,
                section: src?.section ?? null,
                ref: src?.ref ?? null,
                description: src?.description ?? ri.description,
                unit: src?.unit ?? ri.unit,
                quantity,
                rate,
                amount: round(rate != null ? rate * quantity : (src?.amount ?? 0)),
                type: src?.type ?? 'MEASURED',
                costCodeId: src?.costCodeId ?? null,
              };
            }),
          },
        },
      });
      costPlanId = plan.id;
    }
    const c = await this.prisma.projectContract.create({
      data: {
        projectId,
        contractorId: q.contractor.id,
        title: dto.title?.trim() || rfq.title,
        contractForm: dto.contractForm ?? project.contractForm,
        contractSum: q.price,
        currency: q.currency,
        costPlanId,
        rfqId: rfq.id,
        reviewerRole: dto.reviewerRole ?? 'ARCHITECT',
        measured: dto.measured ?? false,
        retentionPct: dto.retentionPct ?? 10,
        retentionLimitPct: dto.retentionLimitPct === undefined ? 5 : dto.retentionLimitPct,
        vatPct: rfq.costPlan?.vatPct ?? 15,
        createdById: userId,
      },
    });
    return this.get(projectId, userId, c.id);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateContractDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    await this.contract(projectId, id);
    await this.checkPlan(projectId, dto.costPlanId);
    const certified = await this.prisma.valuation.count({ where: { contractId: id, status: { in: [...CERTIFIED] } } });
    if (certified && (dto.contractSum !== undefined || dto.retentionPct !== undefined || dto.retentionLimitPct !== undefined || dto.vatPct !== undefined || dto.reviewerRole !== undefined || dto.measured !== undefined)) {
      throw new BadRequestException('Certificates have been issued on this contract, so its sum and retention terms are fixed. Changes come through variations.');
    }
    await this.prisma.projectContract.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate === undefined ? undefined : dto.startDate ? new Date(dto.startDate) : null,
        completionDate: dto.completionDate === undefined ? undefined : dto.completionDate ? new Date(dto.completionDate) : null,
      },
    });
    return this.get(projectId, userId, id);
  }

  async remove(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    await this.contract(projectId, id);
    if (await this.prisma.valuation.count({ where: { contractId: id } })) throw new BadRequestException('This contract has valuations, so it stays');
    await this.prisma.projectContract.delete({ where: { id } });
  }

  /** The final account statement (QS 5.9, 6.2), kept up as the works go:
   * the contract sum, provisional and prime-cost sums taken out and what
   * was spent against them put back, approved variations and agreed claims. */
  async finalAccount(projectId: string, userId: string, id: string) {
    const c = await this.get(projectId, userId, id);
    const [items, variations, claims, latest] = await Promise.all([
      c.costPlanId ? this.prisma.costPlanItem.findMany({ where: { costPlanId: c.costPlanId, type: { in: ['PROVISIONAL_SUM', 'PRIME_COST_SUM'] } } }) : Promise.resolve([]),
      this.prisma.variation.findMany({ where: { contractId: id, status: 'APPROVED' }, select: { id: true, number: true, title: true, assessedValue: true, estimatedValue: true } }),
      this.prisma.projectRegisterEntry.findMany({ where: { projectId, register: 'claims', contractorId: c.contractorId, status: 'AGREED' }, select: { id: true, reference: true, title: true, amount2: true } }),
      this.prisma.valuation.findFirst({ where: { contractId: id }, orderBy: { number: 'desc' }, include: { lines: true } }),
    ]);
    const spentOn = (itemId: string) => latest?.lines.find((l) => l.costPlanItemId === itemId)?.valueToDate ?? 0;
    // A measured contract is remeasured: each measured item at its quantity to
    // date in the latest valuation, against the bill (the user's choice, 2 Nov 2026).
    const sumIds = new Set(items.map((i) => i.id));
    const remeasure = c.measured ? (latest?.lines ?? []).filter((l) => l.rate != null && l.costPlanItemId && !sumIds.has(l.costPlanItemId)).reduce((s, l) => s + (l.valueToDate - l.contractAmount), 0) : 0;
    const dayworks = (latest?.lines ?? []).filter((l) => l.dayworkSheetId).reduce((s, l) => s + l.valueToDate, 0);
    const omitted = items.reduce((s, i) => s + i.amount, 0);
    const expended = items.reduce((s, i) => s + spentOn(i.id), 0);
    const varTotal = variations.reduce((s, v) => s + (v.assessedValue ?? v.estimatedValue), 0);
    const claimTotal = claims.reduce((s, x) => s + (x.amount2 ?? 0), 0);
    const escalation = latest?.escalationToDate ?? 0;
    const finalSum = c.contractSum - omitted + expended + remeasure + dayworks + varTotal + claimTotal + escalation;
    const entry = c.finalAccountEntryId ? await this.prisma.projectRegisterEntry.findUnique({ where: { id: c.finalAccountEntryId }, select: { id: true, status: true, completedAt: true } }) : null;
    return {
      contract: { id: c.id, title: c.title, contractor: c.contractor.name, currency: c.currency, status: c.finalAccountStatus },
      lines: [
        { label: 'Contract sum', amount: round(c.contractSum) },
        ...(items.length ? [{ label: 'Less provisional and prime-cost sums', amount: round(-omitted) }, { label: 'Add provisional and prime-cost sums spent', amount: round(expended) }] : []),
        ...(c.measured ? [{ label: 'Remeasurement (quantities measured, against the bill)', amount: round(remeasure) }] : []),
        ...(dayworks ? [{ label: 'Add signed dayworks', amount: round(dayworks) }] : []),
        { label: `Add approved variations (${variations.length})`, amount: round(varTotal) },
        { label: `Add agreed claims (${claims.length})`, amount: round(claimTotal) },
        ...(escalation ? [{ label: 'Add contract price adjustment', amount: round(escalation) }] : []),
      ],
      finalAccount: round(finalSum),
      change: round(finalSum - c.contractSum),
      variations: variations.map((v) => ({ id: v.id, number: v.number, title: v.title, value: v.assessedValue ?? v.estimatedValue })),
      claims: claims.map((x) => ({ id: x.id, reference: x.reference, title: x.title, amount: x.amount2 ?? 0 })),
      sums: items.map((i) => ({ id: i.id, description: i.description, type: i.type, allowed: i.amount, spent: spentOn(i.id) })),
      certifiedNet: c.standing.certifiedNet,
      retentionHeld: c.standing.retentionHeld,
      register: entry,
    };
  }

  /** The QS prepares and submits the final account; Setjeka records that it
   * is agreed with the contractor (PM 6.7). The final-accounts register
   * follows it. */
  async finalAccountAction(projectId: string, userId: string, id: string, dto: FinalAccountActionDto) {
    const a = await this.access.of(projectId, userId);
    if (dto.action === 'agree') this.access.setjeka(a, 'records a final account as agreed');
    else this.access.preparer(a);
    const fa = await this.finalAccount(projectId, userId, id);
    const c = await this.contract(projectId, id);
    const next = { prepare: 'IN_PREPARATION', submit: 'SUBMITTED', agree: 'AGREED' }[dto.action] as 'IN_PREPARATION' | 'SUBMITTED' | 'AGREED';
    // Preparing again after submitting takes it back for the QS to revise.
    if (c.finalAccountStatus === 'AGREED') throw new BadRequestException('The final account is already agreed');
    if (dto.action === 'agree' && c.finalAccountStatus !== 'SUBMITTED') throw new BadRequestException('The QS submits the final account before it is agreed');
    if (dto.action === 'submit' && c.finalAccountStatus === 'SUBMITTED') throw new BadRequestException('The final account is already submitted');
    const data = {
      contractorId: c.contractorId,
      title: c.title,
      amount: c.contractSum,
      amount2: fa.finalAccount,
      currency: c.currency,
      status: next,
      completedAt: next === 'AGREED' ? new Date() : null,
      notes: dto.notes?.trim() || fa.lines.map((l) => `${l.label}: ${c.currency} ${l.amount.toLocaleString('en-ZA')}`).join('\n'),
    };
    const existing = c.finalAccountEntryId ? await this.prisma.projectRegisterEntry.findUnique({ where: { id: c.finalAccountEntryId } }) : null;
    const entry = existing
      ? await this.prisma.projectRegisterEntry.update({ where: { id: existing.id }, data })
      : await this.prisma.projectRegisterEntry.create({ data: { ...data, projectId, register: 'final-accounts', createdById: userId } });
    await this.prisma.projectContract.update({ where: { id }, data: { finalAccountStatus: next, finalAccountEntryId: entry.id } });
    if (dto.action === 'submit') {
      const who = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
      await this.access.tell(
        projectId,
        await this.access.usersIn(projectId, ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER']),
        userId,
        'VALUATION_SUBMITTED',
        `${who.fullName} submitted the final account for ${c.title} (${c.contractor.name}): ${c.currency} ${Math.round(fa.finalAccount).toLocaleString('en-ZA')}`,
        `/projects/${projectId}?tab=commercial&ctab=contracts`,
      );
    }
    return this.finalAccount(projectId, userId, id);
  }

  /** The QS's cash flow forecast (QS 5.2, DM 3.9): the contract sum spread
   * over the months of the works on an S-curve, into the Cash flow
   * register. Running it again re-spreads the forecast and keeps the actuals
   * already recorded. */
  async cashFlow(projectId: string, userId: string, id: string, dto: CashFlowDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const c = await this.contract(projectId, id);
    const m = dto.startMonth.match(/^(\d{4})-(\d{2})/);
    if (!m) throw new BadRequestException('Give the first month as YYYY-MM');
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    const shares = sCurve(dto.months);
    const ref = cashFlowRef(id);
    const existing = await this.prisma.projectRegisterEntry.findMany({ where: { projectId, register: 'cash-flow', reference: ref } });
    const byMonth = new Map(existing.map((e) => [monthKey(e.date ?? e.createdAt), e]));
    const seen = new Set<string>();
    const note = `${c.title} (${c.contractor.name}): S-curve forecast over ${dto.months} months`;
    for (let i = 0; i < dto.months; i++) {
      const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const key = monthKey(date);
      seen.add(key);
      const amount = round(c.contractSum * shares[i]);
      const row = byMonth.get(key);
      if (row) await this.prisma.projectRegisterEntry.update({ where: { id: row.id }, data: { amount, notes: note } });
      else await this.prisma.projectRegisterEntry.create({ data: { projectId, register: 'cash-flow', reference: ref, date, amount, currency: c.currency, notes: note, createdById: userId } });
    }
    for (const [key, row] of byMonth) {
      if (seen.has(key)) continue;
      if (row.amount2) await this.prisma.projectRegisterEntry.update({ where: { id: row.id }, data: { amount: 0 } });
      else await this.prisma.projectRegisterEntry.delete({ where: { id: row.id } });
    }
    return { months: dto.months, total: round(c.contractSum) };
  }

  /** A paid certificate goes into that month's actual on the cash flow. */
  async recordActual(projectId: string, userId: string, contractId: string, paidAt: Date, amount: number) {
    const c = await this.contract(projectId, contractId);
    const ref = cashFlowRef(contractId);
    const date = new Date(Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), 1));
    const rows = await this.prisma.projectRegisterEntry.findMany({ where: { projectId, register: 'cash-flow', reference: ref } });
    const row = rows.find((r) => monthKey(r.date ?? r.createdAt) === monthKey(date));
    if (row) await this.prisma.projectRegisterEntry.update({ where: { id: row.id }, data: { amount2: round((row.amount2 ?? 0) + amount) } });
    else await this.prisma.projectRegisterEntry.create({ data: { projectId, register: 'cash-flow', reference: ref, date, amount: 0, amount2: round(amount), currency: c.currency, notes: `${c.title} (${c.contractor.name}): paid certificates`, createdById: userId } });
  }
}
