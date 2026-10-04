import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { computeViability } from '../inception/viability.js';
import { evaluateStage0, isValidStage0Item } from './stage0.js';
import { markMilestone } from './milestones.js';
import type { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import type { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import type { ChangeOpportunityStageDto } from './dto/change-stage.dto.js';

const OPPORTUNITY_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  visionConfirmedBy: { select: { id: true, fullName: true } },
  client: { include: { _count: { select: { portalUsers: true } } } },
  convertedProject: { select: { id: true, name: true, projectCode: true } },
  approvals: { orderBy: { createdAt: 'desc' } },
  sites: { orderBy: { createdAt: 'asc' } },
  appointments: { select: { id: true } },
  businessCases: { where: { isPreferred: true } },
  marketResearch: { select: { id: true, status: true } },
  payments: { select: { id: true, status: true, approvedById: true } },
  decisions: { select: { id: true, status: true, decidedAt: true }, orderBy: { createdAt: 'desc' } },
  checks: { include: { doneBy: { select: { fullName: true } } } },
} as const;

const CONSENT_STATUS_BY_APPROVAL = {
  PENDING: 'IN_PREPARATION',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

const CATEGORY_LABEL = { ZONING: 'Zoning', ENVIRONMENTAL: 'Environmental', INFRASTRUCTURE: 'Infrastructure & services', LEGAL: 'Legal', OTHER: 'Other' } as const;

type Loaded = NonNullable<Awaited<ReturnType<OpportunitiesService['load']>>>;

/** PROCSA Stage 0 for every role (see stage0.ts), computed from what's on
 * the opportunity. Replaces the earlier five-item checklist. */
function readiness(o: Loaded) {
  const site = o.sites.find((s) => s.status === 'SELECTED') ?? null;
  const bc = o.businessCases[0];
  const result = bc ? computeViability(bc) : null;
  return evaluateStage0({
    stage: o.stage,
    hasClient: Boolean(o.clientId),
    needAndDesirability: Boolean(o.needAndDesirability?.trim()),
    clientVision: Boolean(o.clientVision?.trim()),
    visionConfirmedAt: o.visionConfirmedAt,
    preferredBusinessCase: result ? { viable: result.viable, profitOnCostPct: result.profitOnCostPct } : null,
    selectedSite: site ? { name: site.name, acquisitionStatus: site.acquisitionStatus } : null,
    // Land rights for the chosen site, plus any not tied to a site.
    landRights: o.approvals.filter((a) => !a.siteId || a.siteId === site?.id),
    completedResearch: o.marketResearch.filter((r) => r.status === 'COMPLETED').length,
    appointments: o.appointments.length,
    payments: o.payments,
    approvedDecisionAt: o.decisions.find((d) => d.status === 'APPROVED')?.decidedAt ?? null,
    checks: o.checks,
  });
}

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private load(id: string) {
    return this.prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE });
  }

  async findAll() {
    const rows = await this.prisma.opportunity.findMany({ include: OPPORTUNITY_INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map((o) => ({ ...o, readiness: readiness(o) }));
  }

  async findOne(id: string) {
    const opportunity = await this.load(id);
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return { ...opportunity, readiness: readiness(opportunity) };
  }

  private async assertClientExists(clientId: string | null | undefined) {
    if (!clientId) return;
    const found = await this.prisma.client.count({ where: { id: clientId } });
    if (!found) throw new BadRequestException('Client not found');
  }

  async create(createdById: string, dto: CreateOpportunityDto) {
    await this.assertClientExists(dto.clientId);
    const created = await this.prisma.opportunity.create({
      data: {
        name: dto.name.trim(),
        description: dto.description,
        needAndDesirability: dto.needAndDesirability,
        clientVision: dto.clientVision,
        developmentType: dto.developmentType,
        location: dto.location,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency,
        clientId: dto.clientId,
        ownerId: dto.ownerId ?? createdById,
        createdById,
      },
    });
    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateOpportunityDto) {
    const existing = await this.findOne(id);
    if (existing.stage === 'CONVERTED') throw new BadRequestException('This opportunity has been converted and is read-only');
    await this.assertClientExists(dto.clientId);
    // A changed vision (or a different client) is no longer the one the
    // client confirmed, so it has to be confirmed again (PROCSA 0.3).
    const visionChanged =
      (dto.clientVision !== undefined && (dto.clientVision ?? '').trim() !== (existing.clientVision ?? '').trim()) ||
      (dto.clientId !== undefined && dto.clientId !== existing.clientId);
    await this.prisma.opportunity.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        needAndDesirability: dto.needAndDesirability,
        clientVision: dto.clientVision,
        developmentType: dto.developmentType,
        location: dto.location,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency,
        clientId: dto.clientId,
        ownerId: dto.ownerId,
        ...(visionChanged ? { visionConfirmedAt: null, visionConfirmedById: null } : {}),
      },
    });
    return this.findOne(id);
  }

  // Every stage change writes an OpportunityStageHistory row. APPROVED is
  // reached only through an Executive's investment decision.
  async changeStage(id: string, changedById: string, dto: ChangeOpportunityStageDto) {
    const existing = await this.findOne(id);
    if (existing.stage === 'CONVERTED') throw new BadRequestException('This opportunity has already been converted to a project');
    if (dto.stage === 'CONVERTED') throw new BadRequestException('Use "Move to Inception" to convert an opportunity into a project');
    if (dto.stage === 'APPROVED') throw new BadRequestException('An opportunity is approved by an Executive’s investment decision, not by changing its stage');
    if (dto.stage === existing.stage) return existing;
    if (await this.prisma.investmentDecision.count({ where: { opportunityId: id, status: 'PENDING' } })) {
      throw new BadRequestException('An investment decision is pending; wait for the Executive before changing the stage');
    }

    await this.prisma.$transaction([
      this.prisma.opportunity.update({ where: { id }, data: { stage: dto.stage } }),
      this.prisma.opportunityStageHistory.create({
        data: { opportunityId: id, previousStage: existing.stage, newStage: dto.stage, changedById, comment: dto.comment },
      }),
    ]);
    return this.findOne(id);
  }

  getHistory(id: string) {
    return this.prisma.opportunityStageHistory.findMany({
      where: { opportunityId: id },
      include: { changedBy: { select: { id: true, fullName: true } } },
      orderBy: { changedAt: 'asc' },
    });
  }

  /** Manual sign-off of a Stage 0 responsibility the app can't evidence
   * itself (stage0.ts). Client items are the client's to confirm in the
   * portal, so staff can't tick them on their behalf. */
  async setCheck(id: string, userId: string, roleKey: string, code: string, done: boolean, note?: string) {
    if (!isValidStage0Item(roleKey, code)) throw new NotFoundException('Unknown Stage 0 responsibility');
    if (roleKey === 'CLIENT') throw new ForbiddenException('The client confirms this themselves in their portal');
    const opportunity = await this.findOne(id);
    if (opportunity.stage === 'CONVERTED') throw new BadRequestException('This opportunity has been converted and is read-only');
    if (done) {
      await this.prisma.opportunityCheck.upsert({
        where: { opportunityId_roleKey_code: { opportunityId: id, roleKey, code } },
        update: { doneById: userId, note: note?.trim() || null, doneAt: new Date() },
        create: { opportunityId: id, roleKey, code, doneById: userId, note: note?.trim() || null },
      });
    } else {
      await this.prisma.opportunityCheck.deleteMany({ where: { opportunityId: id, roleKey, code } });
    }
    return this.findOne(id);
  }

  /** The hand-over from Stage 0 to Inception. Creates the Project from the
   * client and selected site, then carries Stage 0 across: the appointed
   * consultants (as project appointments and Team members), client logins
   * (as CLIENT members), the business cases (as Stage 1 viability
   * scenarios), the land rights (as the consents schedule), paid consultant
   * invoices (as payment records), and the development milestones. */
  async convertToProject(id: string, requestedById: string) {
    const opportunity = await this.findOne(id);
    if (opportunity.stage === 'CONVERTED') throw new BadRequestException('This opportunity has already been converted');
    if (!opportunity.readiness.canConvert) {
      throw new BadRequestException(`Not ready to convert: ${opportunity.readiness.blockers.join('; ')}`);
    }

    const site = opportunity.sites.find((s) => s.status === 'SELECTED')!;
    const client = opportunity.client!;
    const [clientUsers, appointments, scenarios, paidPayments] = await Promise.all([
      this.prisma.user.findMany({ where: { clientId: client.id, status: 'ACTIVE' }, select: { id: true, fullName: true, email: true } }),
      this.prisma.opportunityAppointment.findMany({
        where: { opportunityId: id, projectAppointmentId: null },
        include: { rfq: { select: { rfqNumber: true, title: true, scopeDescription: true } } },
      }),
      this.prisma.viabilityScenario.findMany({ where: { opportunityId: id } }),
      this.prisma.opportunityPayment.findMany({ where: { opportunityId: id, status: 'PAID', appointmentId: { not: null } } }),
    ]);

    // The opportunity *was* Initiation (PROCSA Stage 0), so the project
    // starts at the next stage rather than repeating it.
    const project = await this.projectsService.create(opportunity.ownerId ?? requestedById, {
      stage: 'INCEPTION',
      name: opportunity.name,
      description: opportunity.description ?? undefined,
      client: client.name,
      location: site.address ?? site.name,
      latitude: site.latitude ?? undefined,
      longitude: site.longitude ?? undefined,
      value: opportunity.estimatedValue ?? undefined,
      currency: opportunity.currency ?? undefined,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        const projectAppointmentFor = new Map<string, { id: string; contractorId: string }>();
        for (const a of appointments) {
          const projectAppointment = await tx.organisationProjectAppointment.create({
            data: {
              contractorId: a.contractorId,
              projectId: project.id,
              role: a.role,
              appointmentType: a.discipline,
              appointmentDate: a.createdAt,
              appointmentReference: a.rfq?.rfqNumber,
              contractValue: a.contractValue,
              currency: a.currency,
              scopeOfWork: [a.rfq?.title, a.rfq?.scopeDescription].filter(Boolean).join(' - ') || undefined,
              // Meeting 3: the Stage 0 selection is indicative and not
              // binding. It arrives as PROPOSED; Setjeka confirms or
              // releases it at Inception (InceptionService.confirm/release).
              appointmentStatus: 'PROPOSED',
              rankAtAward: a.rankAtAward,
              scoreAtAward: a.scoreAtAward,
              awardJustification: a.justification,
            },
          });
          projectAppointmentFor.set(a.id, { id: projectAppointment.id, contractorId: a.contractorId });
          await tx.opportunityAppointment.update({ where: { id: a.id }, data: { projectAppointmentId: projectAppointment.id } });
        }

        await tx.projectMember.createMany({
          data: clientUsers.length
            ? clientUsers.map((u) => ({ projectId: project.id, role: 'CLIENT' as const, userId: u.id, externalName: u.fullName, externalEmail: u.email, externalCompany: client.name }))
            : [{ projectId: project.id, role: 'CLIENT' as const, externalName: client.contactName, externalEmail: client.email, externalPhone: client.phone, externalCompany: client.name }],
        });

        // Seed PROCSA Stage 1 from Stage 0: the brief starts from the need
        // and the client's vision; land rights become the consents schedule
        // (PM 1.7); each appointed discipline is a covered required service.
        await tx.projectBrief.create({
          data: {
            projectId: project.id,
            clientRequirements: opportunity.needAndDesirability ?? opportunity.description,
            aspirations: opportunity.clientVision,
            budgetTarget: opportunity.estimatedValue,
          },
        });
        await tx.consentApproval.createMany({
          data: opportunity.approvals.map((ap) => ({
            projectId: project.id,
            title: ap.approvalType,
            category: ap.category ? CATEGORY_LABEL[ap.category] : null,
            authority: ap.authority,
            reference: ap.reference,
            status: CONSENT_STATUS_BY_APPROVAL[ap.status],
            approvedAt: ap.status === 'APPROVED' ? ap.updatedAt : null,
            notes: ap.evidenceNotes,
            sourceApprovalId: ap.id,
          })),
        });
        await tx.requiredService.createMany({
          data: [...new Set(appointments.map((a) => a.discipline).filter((d): d is string => Boolean(d)))].map((discipline) => ({
            projectId: project.id,
            discipline,
          })),
          skipDuplicates: true,
        });

        // First business case (0.2) -> Stage 1 desktop viability (DM 1.3),
        // copied so the opportunity keeps its own record.
        await tx.viabilityScenario.createMany({
          data: scenarios.map(({ id: _id, opportunityId: _o, projectId: _p, createdAt: _c, updatedAt: _u, ...s }) => ({ ...s, projectId: project.id })),
        });

        // Paid Stage 0 consultant invoices (0.8) join the appointment's
        // payment history.
        for (const p of paidPayments) {
          const target = projectAppointmentFor.get(p.appointmentId!);
          if (!target) continue;
          await tx.paymentRecord.create({
            data: {
              contractorId: p.contractorId ?? target.contractorId,
              appointmentId: target.id,
              amount: p.amount,
              currency: p.currency,
              paymentDate: p.paidAt ?? p.updatedAt,
              reference: p.paymentReference ?? p.invoiceReference,
              notes: `Stage 0: ${p.description}`,
              recordedById: p.recordedById,
            },
          });
        }

        // Milestones carry on at project level.
        await tx.developmentMilestone.updateMany({ where: { opportunityId: id }, data: { projectId: project.id } });
        await markMilestone(tx, { projectId: project.id }, 'PROJECT_INCEPTION');

        await tx.opportunity.update({ where: { id }, data: { stage: 'CONVERTED', convertedProjectId: project.id } });
        await tx.opportunityStageHistory.create({
          data: {
            opportunityId: id,
            previousStage: opportunity.stage,
            newStage: 'CONVERTED',
            changedById: requestedById,
            comment: `Converted to project ${project.projectCode ?? project.name} (Inception)`,
          },
        });
      });
    } catch (err) {
      await this.prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      throw err;
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const opportunity = await this.findOne(id);
    if (opportunity.stage === 'CONVERTED') throw new BadRequestException('A converted opportunity is kept as the project\'s Stage 0 record');
    await this.prisma.$transaction([
      // Milestones only survive deletion when they already belong to a project.
      this.prisma.developmentMilestone.deleteMany({ where: { opportunityId: id, projectId: null } }),
      this.prisma.opportunity.delete({ where: { id } }),
    ]);
  }
}
