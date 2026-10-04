import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Currency, OrganisationRegistrationStatus } from '../generated/prisma/enums.js';
import { nextRfqNumber } from '../rfqs/rfqs.service.js';
import { addConsultantMembers } from '../inception/team.js';
import { rankQuotes, ratingSummaries, roleForDiscipline } from './consultant-ranking.js';
import type {
  AwardRfqDto,
  CreateOpportunityRfqDto,
  RecordOpportunityQuoteDto,
  UpdateOpportunityRfqDto,
} from './dto/opportunity-rfq.dto.js';

const RFQ_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  invitations: {
    include: { contractor: { select: { id: true, name: true, registrationStatus: true, prequalificationStatus: true } } },
    orderBy: { invitedAt: 'asc' },
  },
  quotes: {
    where: { status: 'SUBMITTED' },
    include: { contractor: { select: { id: true, name: true } }, submittedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  opportunityAppointments: {
    select: { id: true, contractorId: true, quoteId: true, rankAtAward: true, scoreAtAward: true, justification: true },
  },
} as const;

const OPEN_FOR_QUOTES = ['ISSUED', 'CLOSED'] as const;

const INELIGIBLE_STATUSES: OrganisationRegistrationStatus[] = ['REJECTED', 'SUSPENDED', 'ARCHIVED'];

/** Who an RFQ belongs to: an opportunity (PROCSA Stage 0.7, before any
 * project exists) or a project (Stage 1: DM 1.4 / PM 1.3 "appoint
 * necessary consultants"). The bidding and ranking are identical; only
 * where the appointment lands differs. */
export type RfqOwner = { kind: 'opportunity'; id: string } | { kind: 'project'; id: string };

interface OwnerContext {
  currency: Currency;
  priceWeight: number;
  ratingWeight: number;
}

/** Consultant procurement by discipline: one RFQ sent to every registered
 * firm in it, quotes captured (by staff or by the firm through the vendor
 * portal), and an automatic price + track-record ranking recommending who
 * to appoint. */
@Injectable()
export class OpportunityRfqsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every discipline actually registered in the directory (case-folded so
   * "Architect" and "architect" are one entry), with how many firms carry it. */
  async disciplines() {
    const contractors = await this.prisma.contractor.findMany({
      where: { registrationStatus: { notIn: INELIGIBLE_STATUSES } },
      select: { disciplines: true },
    });
    const byKey = new Map<string, { discipline: string; count: number }>();
    for (const c of contractors) {
      for (const d of new Set(c.disciplines.map((x) => x.trim()).filter(Boolean))) {
        const key = d.toLowerCase();
        const entry = byKey.get(key);
        if (entry) entry.count += 1;
        else byKey.set(key, { discipline: d, count: 1 });
      }
    }
    return [...byKey.values()].sort((a, b) => a.discipline.localeCompare(b.discipline));
  }

  /** All registered firms in a discipline, best track record first. Rejected,
   * suspended and archived registrations are left out. */
  async consultantsForDiscipline(discipline: string) {
    const key = discipline.trim().toLowerCase();
    const contractors = await this.prisma.contractor.findMany({
      where: { registrationStatus: { notIn: INELIGIBLE_STATUSES } },
      select: {
        id: true,
        name: true,
        disciplines: true,
        city: true,
        registrationStatus: true,
        prequalificationStatus: true,
        _count: { select: { portalUsers: true } },
      },
      orderBy: { name: 'asc' },
    });
    const matching = contractors.filter((c) => c.disciplines.some((d) => d.trim().toLowerCase() === key));
    const ratings = await ratingSummaries(this.prisma, matching.map((c) => c.id));
    return matching
      .map(({ _count, ...c }) => ({ ...c, hasPortalAccess: _count.portalUsers > 0, rating: ratings.get(c.id)! }))
      .sort((a, b) => (b.rating.average ?? -1) - (a.rating.average ?? -1) || a.name.localeCompare(b.name));
  }

  private ownerWhere(owner: RfqOwner) {
    // Project consultant RFQs are the ones with a discipline; plain works/
    // supply RFQs stay in the Procurement tab's own flow.
    return owner.kind === 'opportunity' ? { opportunityId: owner.id } : { projectId: owner.id, discipline: { not: null } };
  }

  /** Checks the owner exists and is still open for consultant procurement,
   * and returns the defaults a new RFQ should take. */
  private async openOwner(owner: RfqOwner): Promise<OwnerContext> {
    if (owner.kind === 'opportunity') {
      const opportunity = await this.prisma.opportunity.findUnique({ where: { id: owner.id } });
      if (!opportunity) throw new NotFoundException('Opportunity not found');
      if (opportunity.stage === 'CONVERTED' || opportunity.stage === 'REJECTED') {
        throw new BadRequestException(`This opportunity is ${opportunity.stage.toLowerCase()}; its consultant RFQs are read-only`);
      }
      return { currency: opportunity.currency ?? 'ZAR', priceWeight: 60, ratingWeight: 40 };
    }
    const project = await this.prisma.project.findUnique({ where: { id: owner.id }, include: { procurementPolicy: true } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.stage === 'CLOSEOUT') throw new BadRequestException('This project is in close-out');
    // The project's procurement policy (DM 1.5 / PM 1.2) sets the default
    // evaluation weights.
    return {
      currency: project.currency,
      priceWeight: project.procurementPolicy?.priceWeight ?? 60,
      ratingWeight: project.procurementPolicy?.ratingWeight ?? 40,
    };
  }

  private async getRfq(owner: RfqOwner, rfqId: string) {
    const rfq = await this.prisma.rfq.findFirst({ where: { id: rfqId, ...this.ownerWhere(owner) }, include: RFQ_INCLUDE });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  private async withRanking(owner: RfqOwner, rfqs: Awaited<ReturnType<OpportunityRfqsService['getRfq']>>[]) {
    const ratings = await ratingSummaries(
      this.prisma,
      rfqs.flatMap((r) => [...r.invitations.map((i) => i.contractorId), ...r.quotes.map((q) => q.contractorId)]),
    );
    const projectAppointments =
      owner.kind === 'project'
        ? await this.prisma.organisationProjectAppointment.findMany({
            where: { projectId: owner.id, appointmentReference: { in: rfqs.map((r) => r.rfqNumber) } },
            select: { contractorId: true, appointmentReference: true, rankAtAward: true, awardJustification: true },
          })
        : [];

    return rfqs.map(({ opportunityAppointments, ...rfq }) => {
      let appointment: { contractorId: string; quoteId: string | null; rankAtAward: number | null; justification: string | null } | null = null;
      if (owner.kind === 'opportunity' && opportunityAppointments[0]) {
        const a = opportunityAppointments[0];
        appointment = { contractorId: a.contractorId, quoteId: a.quoteId, rankAtAward: a.rankAtAward, justification: a.justification };
      } else if (owner.kind === 'project') {
        const a = projectAppointments.find((p) => p.appointmentReference === rfq.rfqNumber);
        if (a) {
          const quote = rfq.quotes.find((q) => q.contractorId === a.contractorId);
          appointment = { contractorId: a.contractorId, quoteId: quote?.id ?? null, rankAtAward: a.rankAtAward, justification: a.awardJustification };
        }
      }
      return {
        ...rfq,
        appointment,
        invitations: rfq.invitations.map((i) => ({ ...i, rating: ratings.get(i.contractorId) ?? { average: null, count: 0 } })),
        ranking: rankQuotes(rfq, rfq.quotes, ratings),
      };
    });
  }

  async findAll(owner: RfqOwner) {
    if (owner.kind === 'opportunity') {
      const exists = await this.prisma.opportunity.count({ where: { id: owner.id } });
      if (!exists) throw new NotFoundException('Opportunity not found');
    }
    const rfqs = await this.prisma.rfq.findMany({ where: this.ownerWhere(owner), include: RFQ_INCLUDE, orderBy: { createdAt: 'desc' } });
    return this.withRanking(owner, rfqs);
  }

  async findOne(owner: RfqOwner, rfqId: string) {
    const [rfq] = await this.withRanking(owner, [await this.getRfq(owner, rfqId)]);
    return rfq;
  }

  async create(owner: RfqOwner, userId: string, dto: CreateOpportunityRfqDto) {
    const ctx = await this.openOwner(owner);
    const contractorIds = [...new Set(dto.contractorIds)];
    const found = await this.prisma.contractor.count({ where: { id: { in: contractorIds } } });
    if (found !== contractorIds.length) throw new BadRequestException('One or more selected consultants do not exist');
    const priceWeight = dto.priceWeight ?? ctx.priceWeight;
    const ratingWeight = dto.ratingWeight ?? ctx.ratingWeight;
    this.assertWeights(priceWeight, ratingWeight);

    const rfq = await this.prisma.rfq.create({
      data: {
        ...(owner.kind === 'opportunity' ? { opportunityId: owner.id } : { projectId: owner.id }),
        rfqNumber: await nextRfqNumber(this.prisma),
        title: dto.title.trim(),
        discipline: dto.discipline.trim(),
        scopeDescription: dto.scopeDescription,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currency: dto.currency ?? ctx.currency,
        priceWeight,
        ratingWeight,
        status: dto.issue ? 'ISSUED' : 'DRAFT',
        createdById: userId,
        invitations: { create: contractorIds.map((contractorId) => ({ contractorId })) },
      },
    });
    return this.findOne(owner, rfq.id);
  }

  private assertWeights(priceWeight: number, ratingWeight: number) {
    if (priceWeight + ratingWeight === 0) throw new BadRequestException('Price and rating weights cannot both be zero');
  }

  async update(owner: RfqOwner, rfqId: string, dto: UpdateOpportunityRfqDto) {
    await this.openOwner(owner);
    const rfq = await this.getRfq(owner, rfqId);
    if (rfq.status === 'AWARDED' || rfq.status === 'CANCELLED') throw new BadRequestException(`This RFQ is ${rfq.status.toLowerCase()}`);
    this.assertWeights(dto.priceWeight ?? rfq.priceWeight, dto.ratingWeight ?? rfq.ratingWeight);
    await this.prisma.rfq.update({
      where: { id: rfqId },
      data: {
        title: dto.title?.trim(),
        scopeDescription: dto.scopeDescription,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        priceWeight: dto.priceWeight,
        ratingWeight: dto.ratingWeight,
      },
    });
    return this.findOne(owner, rfqId);
  }

  async invite(owner: RfqOwner, rfqId: string, contractorId: string) {
    await this.openOwner(owner);
    const rfq = await this.getRfq(owner, rfqId);
    if (rfq.status !== 'DRAFT' && rfq.status !== 'ISSUED') throw new BadRequestException('Consultants can only be added before the RFQ closes');
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!contractor) throw new BadRequestException('Consultant not found');
    if (rfq.invitations.some((i) => i.contractorId === contractorId)) throw new BadRequestException('This consultant is already invited');
    await this.prisma.rfqInvitation.create({ data: { rfqId, contractorId } });
    return this.findOne(owner, rfqId);
  }

  async setStatus(owner: RfqOwner, rfqId: string, next: 'ISSUED' | 'CLOSED' | 'CANCELLED') {
    await this.openOwner(owner);
    const rfq = await this.getRfq(owner, rfqId);
    const allowed: Record<typeof next, string[]> = {
      ISSUED: ['DRAFT', 'CLOSED'],
      CLOSED: ['ISSUED'],
      CANCELLED: ['DRAFT', 'ISSUED', 'CLOSED'],
    };
    if (!allowed[next].includes(rfq.status)) {
      throw new BadRequestException(`An RFQ that is ${rfq.status.toLowerCase()} cannot be moved to ${next.toLowerCase()}`);
    }
    await this.prisma.rfq.update({ where: { id: rfqId }, data: { status: next } });
    return this.findOne(owner, rfqId);
  }

  /** Staff capturing a quote that arrived by email/phone. One live quote per
   * consultant per RFQ - a second capture replaces the first. */
  async recordQuote(owner: RfqOwner, rfqId: string, userId: string, dto: RecordOpportunityQuoteDto) {
    await this.openOwner(owner);
    const rfq = await this.getRfq(owner, rfqId);
    if (!(OPEN_FOR_QUOTES as readonly string[]).includes(rfq.status)) {
      throw new BadRequestException('Quotes can only be captured once the RFQ is issued and before it is awarded');
    }
    if (!rfq.invitations.some((i) => i.contractorId === dto.contractorId)) {
      throw new BadRequestException('This consultant was not invited to this RFQ');
    }
    const data = {
      price: dto.price,
      currency: dto.currency,
      leadTimeDays: dto.leadTimeDays,
      technicalProposal: dto.technicalProposal,
      commercialTerms: dto.commercialTerms,
    };
    const existing = rfq.quotes.find((q) => q.contractorId === dto.contractorId);
    if (existing) {
      await this.prisma.quote.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.quote.create({ data: { ...data, rfqId, contractorId: dto.contractorId, submittedById: userId } });
    }
    return this.findOne(owner, rfqId);
  }

  async withdrawQuote(owner: RfqOwner, rfqId: string, quoteId: string) {
    await this.openOwner(owner);
    const rfq = await this.getRfq(owner, rfqId);
    if (rfq.status === 'AWARDED') throw new BadRequestException('This RFQ has already been awarded');
    if (!rfq.quotes.some((q) => q.id === quoteId)) throw new NotFoundException('Quote not found');
    await this.prisma.quote.update({ where: { id: quoteId }, data: { status: 'WITHDRAWN' } });
    return this.findOne(owner, rfqId);
  }

  /** Appointing anyone other than the system's recommendation is allowed -
   * the ranking advises, the Development Manager decides - but needs a
   * written justification, kept with the rank and score the evaluation
   * gave at that moment. On a project the firm becomes a project
   * appointment and joins the Team straight away. */
  async award(owner: RfqOwner, rfqId: string, userId: string, dto: AwardRfqDto) {
    await this.openOwner(owner);
    const rfq = await this.findOne(owner, rfqId);
    if (!(OPEN_FOR_QUOTES as readonly string[]).includes(rfq.status)) {
      throw new BadRequestException('Only an issued or closed RFQ can be awarded');
    }
    const entry = rfq.ranking.find((r) => r.quoteId === dto.quoteId);
    if (!entry) throw new NotFoundException('Quote not found on this RFQ');
    if (entry.rank === null) throw new BadRequestException(entry.excludedReason ?? 'This quote cannot be ranked');
    const justification = dto.justification?.trim() || null;
    if (entry.rank !== 1 && !justification) {
      throw new BadRequestException('A justification is required when not appointing the recommended consultant');
    }
    const role = roleForDiscipline(rfq.discipline);

    if (owner.kind === 'opportunity') {
      await this.prisma.$transaction([
        this.prisma.opportunityAppointment.create({
          data: {
            opportunityId: owner.id,
            contractorId: entry.contractorId,
            rfqId,
            quoteId: entry.quoteId,
            role,
            discipline: rfq.discipline,
            contractValue: entry.price,
            currency: entry.currency,
            rankAtAward: entry.rank,
            scoreAtAward: entry.combinedScore,
            justification,
            appointedById: userId,
          },
        }),
        this.prisma.rfq.update({ where: { id: rfqId }, data: { status: 'AWARDED' } }),
      ]);
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.organisationProjectAppointment.create({
          data: {
            projectId: owner.id,
            contractorId: entry.contractorId,
            role,
            appointmentType: rfq.discipline,
            appointmentDate: new Date(),
            appointmentReference: rfq.rfqNumber,
            contractValue: entry.price,
            currency: entry.currency,
            scopeOfWork: [rfq.title, rfq.scopeDescription].filter(Boolean).join(' - ') || undefined,
            appointmentStatus: 'APPOINTED',
            rankAtAward: entry.rank,
            scoreAtAward: entry.combinedScore,
            awardJustification: justification,
          },
        });
        await addConsultantMembers(tx, owner.id, entry.contractorId, role);
        await tx.rfq.update({ where: { id: rfqId }, data: { status: 'AWARDED' } });
      });
    }
    return this.findOne(owner, rfqId);
  }

  async remove(owner: RfqOwner, rfqId: string) {
    await this.openOwner(owner);
    const rfq = await this.getRfq(owner, rfqId);
    if (rfq.status === 'AWARDED') throw new BadRequestException('An awarded RFQ is kept as the record of the appointment');
    await this.prisma.rfq.delete({ where: { id: rfqId } });
  }

  findAppointments(opportunityId: string) {
    return this.prisma.opportunityAppointment.findMany({
      where: { opportunityId },
      include: {
        contractor: { select: { id: true, name: true, email: true, phone: true } },
        rfq: { select: { id: true, rfqNumber: true, title: true } },
        appointedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Undo an appointment before the project exists; its RFQ goes back to
   * CLOSED so a different consultant can be appointed from the same bids. */
  async revokeAppointment(opportunityId: string, appointmentId: string) {
    await this.openOwner({ kind: 'opportunity', id: opportunityId });
    const appointment = await this.prisma.opportunityAppointment.findFirst({ where: { id: appointmentId, opportunityId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    await this.prisma.$transaction([
      this.prisma.opportunityAppointment.delete({ where: { id: appointmentId } }),
      ...(appointment.rfqId ? [this.prisma.rfq.update({ where: { id: appointment.rfqId }, data: { status: 'CLOSED' } })] : []),
    ]);
  }
}
