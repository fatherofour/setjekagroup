import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { INCEPTION_DELIVERABLES } from '../inception/procsa.js';
import { isExecutive } from '../auth/executive.js';
import type { PermissionModule } from '../generated/prisma/enums.js';

export interface ApprovalItem {
  kind: 'STAGE_DELIVERABLE' | 'STAGE_TRANSITION' | 'INVESTMENT_DECISION' | 'STAGE0_PAYMENT' | 'VARIATION' | 'DOCUMENT_REVISION' | 'PAYMENT_CERTIFICATE' | 'VALUATION';
  id: string;
  title: string;
  context: string;
  href: string;
  requestedBy: string | null;
  requestedAt: Date | null;
  /** When the client was asked to respond by, if a date was set. */
  dueAt: Date | null;
  /** The record to decide on, for the decision dialog. */
  projectId?: string;
  decideKey?: string;
}

/** Register COL "Approval center": one queue of everything waiting on the
 * signed-in user's decision — Stage 1 documents and stage-gate requests on
 * projects, and (for Executives) Stage 0 investment decisions and creditor
 * payments on opportunities. Each item is filtered by the same rule that
 * guards its decide endpoint, and nobody is asked to approve their own
 * request. */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async forUser(userId: string): Promise<ApprovalItem[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (!user) return [];
    const internal = user.role === 'ADMIN' || user.accountType === 'INTERNAL';
    // External users only ever see projects they're a member of.
    const scope = internal ? {} : { project: { members: { some: { userId } } } };
    const projectLabel = (p: { name: string; projectCode: string | null }) => (p.projectCode ? `${p.name} (${p.projectCode})` : p.name);

    const [deliverables, transitions] = await Promise.all([
      this.prisma.stageDeliverable.findMany({
        where: { status: 'SUBMITTED', ...scope },
        include: { project: { select: { id: true, name: true, projectCode: true } }, submittedBy: { select: { fullName: true } } },
      }),
      this.prisma.stageTransition.findMany({
        where: { status: 'PENDING', ...scope },
        include: { project: { select: { id: true, name: true, projectCode: true } }, requestedBy: { select: { fullName: true } } },
      }),
    ]);

    const cache = new Map<string, boolean>();
    const can = async (projectId: string, module: PermissionModule) => {
      const key = `${projectId}:${module}`;
      if (!cache.has(key)) cache.set(key, await this.permissions.can(user.role, user.accountType, userId, projectId, module, 'APPROVE'));
      return cache.get(key)!;
    };

    const items: ApprovalItem[] = [];
    for (const d of deliverables) {
      // Stage 1 documents go to the client alone (DeliverablesService.decide).
      if (user.accountType !== 'EXTERNAL' || d.submittedById === userId || !(await can(d.projectId, 'PROJECT_DEFINITION'))) continue;
      items.push({
        kind: 'STAGE_DELIVERABLE',
        id: d.id,
        title: `${INCEPTION_DELIVERABLES.find((x) => x.key === d.key)?.title ?? d.key} (v${d.version})`,
        context: projectLabel(d.project),
        href: `/projects/${d.projectId}?tab=inception`,
        requestedBy: d.submittedBy?.fullName ?? null,
        requestedAt: d.submittedAt,
        dueAt: d.responseDueAt,
        projectId: d.projectId,
        decideKey: d.key,
      });
    }
    for (const t of transitions) {
      if (t.requestedById === userId || !(await can(t.projectId, 'STAGE_GATE'))) continue;
      items.push({
        kind: 'STAGE_TRANSITION',
        id: t.id,
        title: `Advance from ${t.fromStage} to ${t.toStage}`,
        context: projectLabel(t.project),
        href: `/projects/${t.projectId}?tab=overview`,
        requestedBy: t.requestedBy.fullName,
        requestedAt: t.createdAt,
        dueAt: t.responseDueAt,
        projectId: t.projectId,
      });
    }

    // Variations go to the client alone (Meeting 3 hard rule) - the same
    // check CommercialService.decideVariation makes.
    if (user.accountType === 'EXTERNAL') {
      const variations = await this.prisma.variation.findMany({
        where: { status: 'SUBMITTED', project: { members: { some: { userId, role: 'CLIENT' } } } },
        include: { project: { select: { id: true, name: true, projectCode: true, currency: true } }, raisedBy: { select: { fullName: true } } },
      });
      for (const v of variations) {
        items.push({
          kind: 'VARIATION',
          id: v.id,
          title: `Variation ${v.number}: ${v.title} (${v.project.currency} ${(v.assessedValue ?? v.estimatedValue).toLocaleString('en-ZA')})`,
          context: projectLabel(v.project),
          href: `/projects/${v.projectId}?tab=commercial`,
          requestedBy: v.raisedBy.fullName,
          requestedAt: v.submittedAt,
          dueAt: v.responseDueAt,
          projectId: v.projectId,
        });
      }
      // Payment certificates issued by Setjeka, for the client to approve.
      const certificates = await this.prisma.valuation.findMany({
        where: { status: 'CERTIFIED', project: { members: { some: { userId, role: 'CLIENT' } } } },
        include: { project: { select: { id: true, name: true, projectCode: true } }, contract: { select: { currency: true, contractor: { select: { name: true } } } }, certifiedBy: { select: { fullName: true } } },
      });
      for (const v of certificates) {
        items.push({
          kind: 'PAYMENT_CERTIFICATE',
          id: v.id,
          title: `Payment certificate ${v.certificateNumber}: ${v.contract.contractor.name} (${v.contract.currency} ${v.amountDue.toLocaleString('en-ZA')})`,
          context: projectLabel(v.project),
          href: `/projects/${v.projectId}?tab=commercial&ctab=contracts`,
          requestedBy: v.certifiedBy?.fullName ?? null,
          requestedAt: v.certifiedAt,
          dueAt: v.responseDueAt,
          projectId: v.projectId,
        });
      }
      // Drawings and documents sent for the client's approval and signature.
      const docs = await this.prisma.documentApprovalRequest.findMany({
        where: { status: 'PENDING', project: { members: { some: { userId, role: 'CLIENT' } } } },
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          requestedBy: { select: { fullName: true } },
          revision: { select: { revisionNumber: true, document: { select: { name: true } } } },
        },
      });
      for (const r of docs) {
        items.push({
          kind: 'DOCUMENT_REVISION',
          id: r.id,
          title: `${r.revision.document.name} (Rev ${r.revision.revisionNumber})`,
          context: projectLabel(r.project),
          href: `/projects/${r.projectId}?tab=documents`,
          requestedBy: r.requestedBy.fullName,
          requestedAt: r.createdAt,
          dueAt: r.responseDueAt,
          projectId: r.projectId,
        });
      }
    }

    // Valuations from the QS waiting for Setjeka's Project Manager to issue
    // the certificate (the user's decision, 28 Oct 2026).
    if (internal) {
      const valuations = await this.prisma.valuation.findMany({
        where: { status: 'SUBMITTED', preparedById: { not: userId }, project: { members: { some: { userId, role: { in: ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'] } } } } },
        include: { project: { select: { id: true, name: true, projectCode: true } }, contract: { select: { title: true, currency: true } }, preparedBy: { select: { fullName: true } } },
      });
      for (const v of valuations) {
        items.push({
          kind: 'VALUATION',
          id: v.id,
          title: `Certify valuation ${v.number}: ${v.contract.title} (${v.contract.currency} ${v.amountDue.toLocaleString('en-ZA')})`,
          context: projectLabel(v.project),
          href: `/projects/${v.projectId}?tab=commercial&ctab=contracts`,
          requestedBy: v.preparedBy.fullName,
          requestedAt: v.submittedAt,
          dueAt: null,
          projectId: v.projectId,
        });
      }
    }

    if (isExecutive(user)) {
      const [decisions, payments] = await Promise.all([
        this.prisma.investmentDecision.findMany({
          where: { status: 'PENDING', requestedById: { not: userId } },
          include: { opportunity: { select: { id: true, name: true } }, requestedBy: { select: { fullName: true } } },
        }),
        this.prisma.opportunityPayment.findMany({
          where: { status: 'INVOICED', recordedById: { not: userId } },
          include: {
            opportunity: { select: { id: true, name: true } },
            contractor: { select: { name: true } },
            recordedBy: { select: { fullName: true } },
          },
        }),
      ]);
      for (const d of decisions) {
        items.push({
          kind: 'INVESTMENT_DECISION',
          id: d.id,
          title: 'Investment decision — take this development forward?',
          context: d.opportunity.name,
          href: `/opportunities/${d.opportunityId}`,
          requestedBy: d.requestedBy.fullName,
          requestedAt: d.createdAt,
          dueAt: null,
        });
      }
      for (const p of payments) {
        items.push({
          kind: 'STAGE0_PAYMENT',
          id: p.id,
          title: `Pay ${p.contractor?.name ?? p.payeeName ?? 'creditor'} ${p.currency} ${p.amount.toLocaleString('en-ZA')} — ${p.description}`,
          context: p.opportunity.name,
          href: `/opportunities/${p.opportunityId}?tab=payments`,
          requestedBy: p.recordedBy.fullName,
          requestedAt: p.createdAt,
          dueAt: null,
        });
      }
    }

    // Soonest deadline first; items without one after, oldest first.
    return items.sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
      if (a.dueAt || b.dueAt) return a.dueAt ? -1 : 1;
      return (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0);
    });
  }
}
