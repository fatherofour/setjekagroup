import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CostPlanKind, CostPlanItemType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { round } from '../cost-database/pricing.js';
import { nextRfqNumber } from '../rfqs/rfqs.service.js';
import { QsAccessService, type QsAccess } from './qs-access.service.js';
import { planTotals } from './qs-math.js';
import { readBoq, writeBoq } from './boq-import.js';
import type { CostPlanItemDto, CreateCostPlanDto, CreateTenderDto, UpdateCostPlanDto } from './dto/qs.dto.js';

export const KIND_LABEL: Record<CostPlanKind, string> = {
  PRELIMINARY: 'Preliminary estimate',
  ELEMENTAL: 'Elemental estimate',
  DETAILED: 'Detailed estimate',
  PRE_TENDER: 'Pre-tender estimate',
  TENDER_BOQ: 'Bill of quantities for tender',
  CONTRACT_BOQ: 'Priced contract bill',
};

const PERSON = { select: { fullName: true } } as const;
const ITEM_FIELDS = { section: true, ref: true, description: true, unit: true, quantity: true, rate: true, amount: true, type: true, costCodeId: true } as const;

type SnapshotItem = { section: string | null; ref: string | null; description: string; unit: string | null; quantity: number | null; rate: number | null; amount: number; type: CostPlanItemType; costCodeId: string | null };

/** The QS's bills of quantities and cost plans (PROCSA QS 2.5, 3.5, 4.3,
 * 4.4; register COM "BOQ management"). The QS prepares and issues them;
 * Setjeka accepts them, adopts one as the budget, and tenders from one. */
@Injectable()
export class CostPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QsAccessService,
  ) {}

  private totals(p: { prelimsPct: number; contingencyPct: number; escalationPct: number; vatPct: number; grossFloorArea: number | null }, items: { section: string | null; type: string; amount: number }[]) {
    return planTotals(items, p);
  }

  /** The client sees a bill once Setjeka has accepted it; the QS and
   * Setjeka see drafts too. */
  private visible(a: QsAccess) {
    return a.internal || a.qs ? {} : { status: 'ACCEPTED' as const };
  }

  async list(projectId: string, userId: string) {
    const a = await this.access.of(projectId, userId);
    const plans = await this.prisma.costPlan.findMany({
      where: { projectId, ...this.visible(a) },
      include: { items: { select: { section: true, type: true, amount: true } }, preparedBy: PERSON, acceptedBy: PERSON },
      orderBy: { createdAt: 'desc' },
    });
    return plans.map(({ items, ...p }) => ({ ...p, kindLabel: KIND_LABEL[p.kind], itemCount: items.length, totals: this.totals(p, items) }));
  }

  private async plan(projectId: string, id: string) {
    const p = await this.prisma.costPlan.findFirst({ where: { id, projectId } });
    if (!p) throw new NotFoundException('Bill not found');
    return p;
  }

  async get(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    const p = await this.prisma.costPlan.findFirst({
      where: { id, projectId, ...this.visible(a) },
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { costCode: { select: { id: true, code: true, name: true } } } },
        revisions: { select: { id: true, revision: true, total: true, itemCount: true, reason: true, issuedAt: true, issuedBy: PERSON }, orderBy: { revision: 'desc' } },
        rfqs: { select: { id: true, rfqNumber: true, title: true, status: true } },
        contracts: { select: { id: true, title: true } },
        preparedBy: PERSON,
        acceptedBy: PERSON,
      },
    });
    if (!p) throw new NotFoundException('Bill not found');
    return {
      ...p,
      kindLabel: KIND_LABEL[p.kind],
      totals: this.totals(p, p.items),
      canEdit: a.internal || a.qs,
      canAccept: a.internal && p.status === 'ISSUED',
    };
  }

  private async nextNumber(projectId: string) {
    const rows = await this.prisma.costPlan.findMany({ where: { projectId }, select: { number: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r.number.replace(/\D/g, ''), 10) || 0), 0);
    return `BQ-${String(max + 1).padStart(3, '0')}`;
  }

  async create(projectId: string, userId: string, dto: CreateCostPlanDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true } });
    const { copyFromId, ...data } = dto;
    const source = copyFromId ? await this.prisma.costPlan.findFirst({ where: { id: copyFromId, projectId }, include: { items: { orderBy: { sortOrder: 'asc' } } } }) : null;
    if (copyFromId && !source) throw new BadRequestException('The bill to copy from is not on this project');
    const plan = await this.prisma.costPlan.create({
      data: {
        ...data,
        title: dto.title.trim(),
        projectId,
        number: await this.nextNumber(projectId),
        currency: dto.currency ?? source?.currency ?? project.currency,
        grossFloorArea: dto.grossFloorArea ?? source?.grossFloorArea,
        preparedById: userId,
        items: source ? { create: source.items.map((i, k) => ({ sortOrder: k, section: i.section, ref: i.ref, description: i.description, unit: i.unit, quantity: i.quantity, rate: i.rate, amount: i.amount, type: i.type, costCodeId: i.costCodeId, notes: i.notes })) } : undefined,
      },
    });
    return this.get(projectId, userId, plan.id);
  }

  /** Editing an issued or accepted bill takes it back to a draft; the issued
   * revision stays in the history. */
  private reopen = { status: 'DRAFT' as const, acceptedById: null, acceptedAt: null };

  async update(projectId: string, userId: string, id: string, dto: UpdateCostPlanDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.plan(projectId, id);
    await this.prisma.costPlan.update({ where: { id }, data: { ...dto, ...(p.status === 'DRAFT' ? {} : this.reopen) } });
    return this.get(projectId, userId, id);
  }

  private async checkCodes(items: CostPlanItemDto[]) {
    const ids = [...new Set(items.map((i) => i.costCodeId).filter((x): x is string => Boolean(x)))];
    if (!ids.length) return;
    const found = await this.prisma.costCode.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('A cost code was not found');
  }

  private itemData(i: CostPlanItemDto, sortOrder: number) {
    const quantity = i.quantity ?? null;
    const rate = i.rate ?? null;
    const amount = quantity != null && rate != null ? round(quantity * rate) : round(i.amount ?? 0);
    return {
      sortOrder,
      section: i.section?.trim() || null,
      ref: i.ref?.trim() || null,
      description: i.description.trim(),
      unit: i.unit?.trim() || null,
      quantity,
      rate,
      amount,
      type: i.type ?? 'MEASURED',
      costCodeId: i.costCodeId || null,
      notes: i.notes?.trim() || null,
    };
  }

  /** Save the whole bill at once, as it stands in the editor: rows that are
   * gone are removed, the rest are written in order. */
  async saveItems(projectId: string, userId: string, id: string, items: CostPlanItemDto[]) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.plan(projectId, id);
    await this.checkCodes(items);
    const existing = new Set((await this.prisma.costPlanItem.findMany({ where: { costPlanId: id }, select: { id: true } })).map((x) => x.id));
    const keep = items.filter((i) => i.id && existing.has(i.id)).map((i) => i.id!);
    await this.prisma.$transaction([
      this.prisma.costPlanItem.deleteMany({ where: { costPlanId: id, id: { notIn: keep } } }),
      ...items.map((i, k) =>
        i.id && existing.has(i.id)
          ? this.prisma.costPlanItem.update({ where: { id: i.id }, data: this.itemData(i, k) })
          : this.prisma.costPlanItem.create({ data: { ...this.itemData(i, k), costPlanId: id } }),
      ),
      this.prisma.costPlan.update({ where: { id }, data: p.status === 'DRAFT' ? {} : this.reopen }),
    ]);
    return this.get(projectId, userId, id);
  }

  async importFile(projectId: string, userId: string, id: string, file: Express.Multer.File | undefined, mode: 'replace' | 'append' = 'replace') {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.plan(projectId, id);
    if (!file) throw new BadRequestException('Choose an Excel or CSV file');
    if (!/\.(xlsx|csv|txt)$/i.test(file.originalname)) throw new BadRequestException('Import an .xlsx or .csv file. Save an older .xls as .xlsx first.');
    let parsed: Awaited<ReturnType<typeof readBoq>>;
    try {
      parsed = await readBoq(file.buffer, file.originalname);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'The file could not be read');
    }
    const start = mode === 'append' ? await this.prisma.costPlanItem.count({ where: { costPlanId: id } }) : 0;
    await this.prisma.$transaction([
      ...(mode === 'replace' ? [this.prisma.costPlanItem.deleteMany({ where: { costPlanId: id } })] : []),
      this.prisma.costPlanItem.createMany({ data: parsed.items.map((i, k) => ({ ...i, costPlanId: id, sortOrder: start + k })) }),
      this.prisma.costPlan.update({ where: { id }, data: { sourceFileName: file.originalname.slice(0, 200), ...(p.status === 'DRAFT' ? {} : this.reopen) } }),
    ]);
    return { plan: await this.get(projectId, userId, id), imported: parsed.items.length, skipped: parsed.skipped.slice(0, 50) };
  }

  /** Issue a revision (QS 2.5, 3.5): the items are frozen in the history and
   * Setjeka is told it's ready to accept. */
  async issue(projectId: string, userId: string, id: string, reason?: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.prisma.costPlan.findFirst({ where: { id, projectId }, include: { items: { orderBy: { sortOrder: 'asc' }, select: ITEM_FIELDS } } });
    if (!p) throw new NotFoundException('Bill not found');
    if (p.status !== 'DRAFT') throw new BadRequestException('This revision is already issued. Change the bill to start the next one.');
    if (!p.items.length) throw new BadRequestException('Add items before issuing the bill');
    const revision = p.revision + 1;
    const totals = this.totals(p, p.items);
    await this.prisma.$transaction([
      this.prisma.costPlanRevision.create({ data: { costPlanId: id, revision, total: totals.totalExclVat, itemCount: p.items.length, snapshot: p.items, reason: reason?.trim() || null, issuedById: userId } }),
      this.prisma.costPlan.update({ where: { id }, data: { revision, status: 'ISSUED', issuedAt: new Date() } }),
    ]);
    const who = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
    await this.access.tell(
      projectId,
      await this.access.usersIn(projectId, ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER']),
      userId,
      'COST_PLAN_ISSUED',
      `${who.fullName} issued ${p.number} rev ${revision}, ${KIND_LABEL[p.kind].toLowerCase()} "${p.title}" (${p.currency} ${Math.round(totals.totalExclVat).toLocaleString('en-ZA')} excl. VAT)`,
      `/projects/${projectId}?tab=commercial&ctab=bills&plan=${id}`,
    );
    return this.get(projectId, userId, id);
  }

  async accept(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.setjeka(a, 'accepts a bill');
    const p = await this.plan(projectId, id);
    if (p.status !== 'ISSUED') throw new BadRequestException('Only an issued bill can be accepted');
    await this.prisma.costPlan.update({ where: { id }, data: { status: 'ACCEPTED', acceptedById: userId, acceptedAt: new Date() } });
    return this.get(projectId, userId, id);
  }

  async remove(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.prisma.costPlan.findFirst({ where: { id, projectId }, include: { _count: { select: { contracts: true, rfqs: true } } } });
    if (!p) throw new NotFoundException('Bill not found');
    if (p._count.contracts || p._count.rfqs) throw new BadRequestException('This bill is used by a tender or a contract, so it stays');
    if (!a.internal && p.revision > 0) throw new ForbiddenException('An issued bill is part of the record; ask Setjeka to remove it');
    await this.prisma.costPlan.delete({ where: { id } });
  }

  async revision(projectId: string, userId: string, id: string, revision: number) {
    await this.get(projectId, userId, id);
    const r = await this.prisma.costPlanRevision.findUnique({ where: { costPlanId_revision: { costPlanId: id, revision } }, include: { issuedBy: PERSON } });
    if (!r) throw new NotFoundException('Revision not found');
    return r;
  }

  /** What moved between two issued revisions (or a revision and the bill as
   * it stands), bill by bill. */
  async compare(projectId: string, userId: string, id: string, from: number, to: number | 'current') {
    const p = await this.get(projectId, userId, id);
    const itemsAt = async (rev: number | 'current') => (rev === 'current' ? p.items : ((await this.revision(projectId, userId, id, rev)).snapshot as unknown as SnapshotItem[]));
    const [a, b] = await Promise.all([itemsAt(from), itemsAt(to)]);
    const ta = this.totals(p, a);
    const tb = this.totals(p, b);
    const names = [...new Set([...ta.sections.map((s) => s.section), ...tb.sections.map((s) => s.section)])];
    const rows = names.map((section) => {
      const x = ta.sections.find((s) => s.section === section)?.total ?? 0;
      const y = tb.sections.find((s) => s.section === section)?.total ?? 0;
      return { section, from: x, to: y, change: round(y - x) };
    });
    return { from, to, rows, totals: { from: ta.totalExclVat, to: tb.totalExclVat, change: round(tb.totalExclVat - ta.totalExclVat) } };
  }

  async exportXlsx(projectId: string, userId: string, id: string) {
    const p = await this.get(projectId, userId, id);
    const t = p.totals;
    const totals = [
      { label: 'Subtotal', value: t.subtotal },
      ...(t.prelims ? [{ label: `Preliminaries (${p.prelimsPct}%)`, value: t.prelims }] : []),
      ...(t.contingency ? [{ label: `Contingency (${p.contingencyPct}%)`, value: t.contingency }] : []),
      ...(t.escalation ? [{ label: `Escalation (${p.escalationPct}%)`, value: t.escalation }] : []),
      { label: 'Total excluding VAT', value: t.totalExclVat },
      { label: `VAT (${p.vatPct}%)`, value: t.vat },
      { label: 'Total', value: t.total },
    ];
    const buffer = await writeBoq({ number: p.number, title: p.title, currency: p.currency, items: p.items }, totals);
    return { buffer, filename: `${p.number} ${p.title}.xlsx`.replace(/[\\/:*?"<>|]/g, '-') };
  }

  /** An accepted bill becomes the project budget, by cost code: escalation
   * spread pro rata, preliminaries on code 01, and its contingency as the
   * budget contingency. VAT is left out. */
  async adoptAsBudget(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.setjeka(a, 'sets the budget');
    const p = await this.prisma.costPlan.findFirst({ where: { id, projectId }, include: { items: true } });
    if (!p) throw new NotFoundException('Bill not found');
    if (p.status !== 'ACCEPTED') throw new BadRequestException('Accept the bill before adopting it as the budget');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true } });
    if (project.currency !== p.currency) throw new BadRequestException(`The bill is in ${p.currency} but the project budget is in ${project.currency}`);
    const budget = await this.prisma.projectBudget.findUnique({ where: { projectId } });
    if (budget?.lockedAt) throw new BadRequestException('The project budget is locked; changes now come through variations');
    const uncoded = p.items.filter((i) => !i.costCodeId && i.amount !== 0).length;
    if (uncoded) throw new BadRequestException(`Give every item a cost code before adopting the bill (${uncoded} without one)`);
    const t = this.totals(p, p.items);
    const prelimCode = await this.prisma.costCode.findUnique({ where: { code: '01' } });
    if (t.prelims && !prelimCode) throw new BadRequestException('Cost code 01 (preliminaries) is missing');
    const byCode = new Map<string, number>();
    for (const i of p.items) if (i.costCodeId) byCode.set(i.costCodeId, (byCode.get(i.costCodeId) ?? 0) + i.amount);
    if (t.prelims && prelimCode) byCode.set(prelimCode.id, (byCode.get(prelimCode.id) ?? 0) + t.prelims);
    const base = t.subtotal + t.prelims || 1;
    const lines = [...byCode.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([costCodeId, amount]) => ({ projectId, costCodeId, description: `From ${p.number} rev ${p.revision}`, amount: round(amount + (t.escalation * amount) / base) }));
    await this.prisma.$transaction([
      this.prisma.budgetLine.deleteMany({ where: { projectId } }),
      this.prisma.budgetLine.createMany({ data: lines }),
      this.prisma.projectBudget.upsert({
        where: { projectId },
        update: { contingencyAmount: t.contingency, sourceEstimateId: null },
        create: { projectId, contingencyAmount: t.contingency },
      }),
    ]);
    return { lines: lines.length, contingency: t.contingency };
  }

  /** Go to tender on the bill (QS 4.4, 4.5): a draft RFQ whose items are the
   * bill's, for tenderers to price. Setjeka invites, issues and awards it as
   * any other RFQ. */
  async createTender(projectId: string, userId: string, id: string, dto: CreateTenderDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.prisma.costPlan.findFirst({ where: { id, projectId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!p) throw new NotFoundException('Bill not found');
    if (p.status === 'DRAFT') throw new BadRequestException('Issue the bill before going to tender on it');
    if (!p.items.length) throw new BadRequestException('The bill has no items');
    const rfq = await this.prisma.rfq.create({
      data: {
        projectId,
        rfqNumber: await nextRfqNumber(this.prisma),
        title: dto.title.trim(),
        scopeDescription: dto.scopeDescription?.trim() || `Priced against ${p.number} rev ${p.revision}, ${p.title}`,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currency: p.currency,
        createdById: userId,
        costPlanId: id,
        items: {
          create: p.items.map((i, k) => ({
            description: [i.ref, i.section && `${i.section}:`, i.description].filter(Boolean).join(' ').slice(0, 500),
            unit: i.unit || 'sum',
            quantity: i.quantity ?? 1,
            sortOrder: k,
            costPlanItemId: i.id,
          })),
        },
      },
    });
    return { id: rfq.id, rfqNumber: rfq.rfqNumber };
  }

  /** The financial evaluation of tenders (QS 4.6): each tenderer's total
   * against the QS's own, and the items priced furthest from the QS's
   * rates. */
  async tenders(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const p = await this.prisma.costPlan.findFirst({ where: { id, projectId }, include: { items: true } });
    if (!p) throw new NotFoundException('Bill not found');
    const own = this.totals(p, p.items).subtotal;
    const rfqs = await this.prisma.rfq.findMany({
      where: { projectId, costPlanId: id },
      include: {
        items: { select: { id: true, description: true, quantity: true, costPlanItemId: true } },
        quotes: { where: { status: { not: 'WITHDRAWN' } }, select: { id: true, price: true, currency: true, status: true, contractor: { select: { name: true } }, items: { select: { rfqItemId: true, unitRate: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const itemById = new Map(p.items.map((i) => [i.id, i]));
    return rfqs.map((r) => ({
      id: r.id,
      rfqNumber: r.rfqNumber,
      title: r.title,
      status: r.status,
      awardedQuoteId: r.awardedQuoteId,
      ownTotal: own,
      quotes: r.quotes
        .map((q) => {
          const outliers = q.items
            .map((qi) => {
              const ri = r.items.find((x) => x.id === qi.rfqItemId);
              const mine = ri?.costPlanItemId ? itemById.get(ri.costPlanItemId) : undefined;
              const myRate = mine ? (mine.rate ?? (mine.quantity ? mine.amount / mine.quantity : mine.amount)) : null;
              if (!ri || !myRate) return null;
              return { description: ri.description, qsRate: round(myRate), tenderRate: qi.unitRate, difference: round(((qi.unitRate - myRate) / myRate) * 100) };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x))
            .sort((x, y) => Math.abs(y.difference) - Math.abs(x.difference))
            .slice(0, 5);
          return {
            id: q.id,
            contractor: q.contractor.name,
            price: q.price,
            currency: q.currency,
            status: q.status,
            againstQs: own ? round(((q.price - own) / own) * 100) : null,
            outliers,
          };
        })
        .sort((x, y) => x.price - y.price),
    }));
  }
}
