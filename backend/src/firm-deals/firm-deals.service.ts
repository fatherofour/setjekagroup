import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { round } from '../cost-database/pricing.js';

const CERTIFIED = ['CERTIFIED', 'APPROVED', 'PAID'];
/** Agreed: a let contract, a signed-up appointment, or an approved or issued
 * order. A proposed appointment or a draft order is listed, not counted. */
const AGREED_APPOINTMENT = ['APPOINTED', 'ACTIVE', 'COMPLETED'];
const AGREED_ORDER = ['APPROVED', 'ISSUED'];
const label = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ');

export interface Deal {
  kind: 'CONTRACT' | 'APPOINTMENT' | 'ORDER';
  id: string;
  firm: { id: string; name: string };
  title: string;
  status: string;
  agreed: boolean;
  currency: string;
  /** The value as let, approved variations, and the two together. */
  original: number;
  variations: number;
  value: number;
  certified: number;
  paid: number;
}
export interface Totals {
  currency: string;
  value: number;
  certified: number;
  paid: number;
  notYetAgreed: number;
}

/** A firm's own business with Setjeka (the user's rule, 14 Nov 2026): a
 * contractor or consultant sees the value of their own contracts,
 * appointments and orders on each project, and their overall total across
 * projects, never the project's value with the client or another firm's
 * contract. */
@Injectable()
export class FirmDealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /** The (project, firm) pairs this person speaks for: the firm they're on
   * each project for, and their own firm (a portal account) on any project.
   * Setjeka's staff speak for no firm. */
  private async firms(userId: string, projectId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, contractorId: true } });
    if (!user || user.role === 'ADMIN' || user.accountType === 'INTERNAL') return { pairs: [] as { projectId: string; contractorId: string }[], own: null as string | null };
    const members = await this.prisma.projectMember.findMany({
      where: { userId, contractorId: { not: null }, ...(projectId ? { projectId } : {}) },
      select: { projectId: true, contractorId: true },
    });
    return { pairs: members.map((m) => ({ projectId: m.projectId, contractorId: m.contractorId! })), own: user.contractorId };
  }

  private async deals(where: { projectId?: string; contractorId: string }[]) {
    if (!where.length) return [];
    const [contracts, appointments, orders] = await Promise.all([
      this.prisma.projectContract.findMany({
        where: { OR: where },
        select: {
          id: true,
          projectId: true,
          title: true,
          contractSum: true,
          currency: true,
          finalAccountStatus: true,
          contractor: { select: { id: true, name: true } },
          variations: { where: { status: 'APPROVED' }, select: { assessedValue: true, estimatedValue: true } },
          valuations: { orderBy: { number: 'asc' }, select: { status: true, cumulativeNet: true, amountDue: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.organisationProjectAppointment.findMany({
        where: { OR: where, appointmentStatus: { not: 'TERMINATED' }, contractValue: { not: null } },
        select: {
          id: true,
          projectId: true,
          role: true,
          scopeOfWork: true,
          contractValue: true,
          currency: true,
          appointmentStatus: true,
          contractor: { select: { id: true, name: true } },
          payments: { select: { amount: true } },
          project: { select: { currency: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // An order placed under an appointment is part of that appointment.
      this.prisma.purchaseOrder.findMany({
        where: { OR: where, status: { not: 'CANCELLED' }, appointmentId: null },
        select: {
          id: true,
          projectId: true,
          poNumber: true,
          scopeDescription: true,
          value: true,
          currency: true,
          status: true,
          contractor: { select: { id: true, name: true } },
          invoices: { where: { status: 'PAID' }, select: { amount: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const out: (Deal & { projectId: string })[] = [];
    for (const c of contracts) {
      const variations = round(c.variations.reduce((s, v) => s + (v.assessedValue ?? v.estimatedValue), 0));
      const last = [...c.valuations].reverse().find((v) => CERTIFIED.includes(v.status));
      out.push({
        kind: 'CONTRACT',
        id: c.id,
        projectId: c.projectId,
        firm: c.contractor,
        title: c.title,
        status: c.finalAccountStatus === 'AGREED' ? 'Final account agreed' : 'Contract let',
        agreed: true,
        currency: c.currency,
        original: c.contractSum,
        variations,
        value: round(c.contractSum + variations),
        certified: last?.cumulativeNet ?? 0,
        paid: round(c.valuations.filter((v) => v.status === 'PAID').reduce((s, v) => s + v.amountDue, 0)),
      });
    }
    for (const a of appointments) {
      const v = a.contractValue ?? 0;
      out.push({
        kind: 'APPOINTMENT',
        id: a.id,
        projectId: a.projectId,
        firm: a.contractor,
        title: a.scopeOfWork?.split('\n')[0]?.slice(0, 120) || `Appointment as ${label(a.role)}`,
        status: label(a.appointmentStatus),
        agreed: AGREED_APPOINTMENT.includes(a.appointmentStatus),
        currency: a.currency ?? a.project.currency,
        original: v,
        variations: 0,
        value: v,
        certified: 0,
        paid: round(a.payments.reduce((s, p) => s + p.amount, 0)),
      });
    }
    for (const o of orders) {
      out.push({
        kind: 'ORDER',
        id: o.id,
        projectId: o.projectId,
        firm: o.contractor,
        title: `${o.poNumber}${o.scopeDescription ? `: ${o.scopeDescription.slice(0, 100)}` : ''}`,
        status: label(o.status),
        agreed: AGREED_ORDER.includes(o.status),
        currency: o.currency,
        original: o.value,
        variations: 0,
        value: o.value,
        certified: 0,
        paid: round(o.invoices.reduce((s, i) => s + i.amount, 0)),
      });
    }
    return out;
  }

  /** Totals per currency: rand and naira are never added together. */
  private totals(deals: Deal[]): Totals[] {
    const by = new Map<string, Totals>();
    for (const d of deals) {
      const t = by.get(d.currency) ?? { currency: d.currency, value: 0, certified: 0, paid: 0, notYetAgreed: 0 };
      if (d.agreed) {
        t.value = round(t.value + d.value);
        t.certified = round(t.certified + d.certified);
        t.paid = round(t.paid + d.paid);
      } else t.notYetAgreed = round(t.notYetAgreed + d.value);
      by.set(d.currency, t);
    }
    return [...by.values()];
  }

  private firmsOf(deals: Deal[]) {
    return [...new Map(deals.map((d) => [d.firm.id, d.firm])).values()];
  }

  /** One project: this person's firm's deals on it. */
  async forProject(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const { pairs, own } = await this.firms(userId, projectId);
    const firmIds = new Set(pairs.map((p) => p.contractorId));
    if (own) firmIds.add(own);
    const deals = (await this.deals([...firmIds].map((contractorId) => ({ projectId, contractorId })))).map(({ projectId: _p, ...d }) => d);
    return { firms: this.firmsOf(deals), deals, totals: this.totals(deals) };
  }

  /** Every project: the overall value of this person's firm's work with
   * Setjeka, and each project's share of it. */
  async overall(userId: string) {
    const { pairs, own } = await this.firms(userId);
    const where = [...pairs, ...(own ? [{ contractorId: own }] : [])];
    const seen = new Set<string>();
    const deals = (await this.deals(where)).filter((d) => {
      const k = `${d.kind}:${d.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const ids = [...new Set(deals.map((d) => d.projectId))];
    const projects = await this.prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, projectCode: true } });
    const rows = projects
      .map((p) => {
        const mine = deals.filter((d) => d.projectId === p.id);
        return { project: p, deals: mine.length, totals: this.totals(mine) };
      })
      .sort((a, b) => a.project.name.localeCompare(b.project.name));
    return { firms: this.firmsOf(deals), projects: rows, totals: this.totals(deals) };
  }
}
