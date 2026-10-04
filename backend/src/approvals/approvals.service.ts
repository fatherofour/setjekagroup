import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { INCEPTION_DELIVERABLES } from '../inception/procsa.js';
import { isExecutive } from '../auth/executive.js';
import type { PermissionModule } from '../generated/prisma/enums.js';

export interface ApprovalItem {
  kind: 'STAGE_DELIVERABLE' | 'STAGE_TRANSITION' | 'INVESTMENT_DECISION' | 'STAGE0_PAYMENT' | 'VARIATION';
  id: string;
  title: string;
  context: string;
  href: string;
  requestedBy: string | null;
  requestedAt: Date | null;
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
        });
      }
    }

    return items.sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0));
  }
}
