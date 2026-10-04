import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { computeViability } from './viability.js';
import { InceptionStateService } from './inception-state.service.js';
import { INCEPTION_DELIVERABLES, type DeliverableKey } from './procsa.js';

// The approval snapshot stays server-side: the PROFESSIONAL_TEAM one holds
// every firm's fee, and consultants and the client can read this list.
const EVENT_INCLUDE = {
  select: { id: true, type: true, version: true, comment: true, createdAt: true, actor: { select: { fullName: true } } },
} as const;

/** Client sign-off of the Stage 1 documents (PROCSA PM 1.9). Statuses:
 * DRAFT -> SUBMITTED -> APPROVED, or REVISION_REQUESTED back to the team.
 * Editing a document that's submitted or approved reopens it (touch), so
 * an approval always matches what's actually on file. */
@Injectable()
export class DeliverablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: InceptionStateService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  private assertKey(key: string): asserts key is DeliverableKey {
    if (!INCEPTION_DELIVERABLES.some((d) => d.key === key)) throw new NotFoundException('Unknown Stage 1 deliverable');
  }

  private async row(projectId: string, key: DeliverableKey) {
    return this.prisma.stageDeliverable.upsert({
      where: { projectId_stage_key: { projectId, stage: 'INCEPTION', key } },
      update: {},
      create: { projectId, stage: 'INCEPTION', key },
    });
  }

  async list(projectId: string) {
    const state = await this.state.load(projectId);
    const rows = await this.prisma.stageDeliverable.findMany({
      where: { projectId, stage: 'INCEPTION' },
      include: {
        submittedBy: { select: { fullName: true } },
        decidedBy: { select: { fullName: true } },
        events: { ...EVENT_INCLUDE, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    return INCEPTION_DELIVERABLES.map((d) => {
      const row = rows.find((r) => r.key === d.key);
      return {
        ...d,
        ready: this.state.ready(state, d.key),
        status: row?.status ?? 'DRAFT',
        version: row?.version ?? 1,
        submittedBy: row?.submittedBy ?? null,
        submittedAt: row?.submittedAt ?? null,
        decidedBy: row?.decidedBy ?? null,
        decidedAt: row?.decidedAt ?? null,
        decisionComment: row?.decisionComment ?? null,
        events: row?.events ?? [],
      };
    });
  }

  async submit(projectId: string, key: string, userId: string, comment?: string) {
    this.assertKey(key);
    const state = await this.state.load(projectId);
    if (!this.state.ready(state, key)) {
      const d = INCEPTION_DELIVERABLES.find((x) => x.key === key)!;
      throw new BadRequestException(`Not ready to submit — ${d.readyWhen.toLowerCase()}`);
    }
    const row = await this.row(projectId, key);
    if (row.status === 'SUBMITTED') throw new BadRequestException('Already awaiting the client’s decision');
    if (row.status === 'APPROVED') throw new BadRequestException('Already approved — edit it to start a new version');

    await this.prisma.$transaction([
      this.prisma.stageDeliverable.update({
        where: { id: row.id },
        data: { status: 'SUBMITTED', submittedById: userId, submittedAt: new Date(), decidedById: null, decidedAt: null, decisionComment: null },
      }),
      this.prisma.stageDeliverableEvent.create({ data: { deliverableId: row.id, type: 'SUBMITTED', version: row.version, actorId: userId, comment } }),
    ]);
    await this.notifyApprovers(projectId, userId, row.id, key, state.project?.name ?? 'Project');
    return this.list(projectId);
  }

  /** Meeting 3 hard rule: only the client approves. Checked here, not just
   * in the permission matrix, so neither Setjeka staff nor an admin can
   * approve a Stage 1 document on the client's behalf. */
  async decide(projectId: string, key: string, userId: string, approve: boolean, comment?: string) {
    this.assertKey(key);
    const [user, asClient] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } }),
      this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }),
    ]);
    if (!asClient || user?.accountType !== 'EXTERNAL') throw new ForbiddenException('Only the client can approve Stage 1 documents or ask for a revision');
    const row = await this.row(projectId, key);
    if (row.status !== 'SUBMITTED') throw new BadRequestException('Only a submitted document can be decided');
    if (!approve && !comment?.trim()) throw new BadRequestException('Say what needs to change when requesting a revision');

    const snapshot = approve ? await this.snapshot(projectId, key) : undefined;
    await this.prisma.$transaction([
      this.prisma.stageDeliverable.update({
        where: { id: row.id },
        data: { status: approve ? 'APPROVED' : 'REVISION_REQUESTED', decidedById: userId, decidedAt: new Date(), decisionComment: comment },
      }),
      this.prisma.stageDeliverableEvent.create({
        data: {
          deliverableId: row.id,
          type: approve ? 'APPROVED' : 'REVISION_REQUESTED',
          version: row.version,
          actorId: userId,
          comment,
          snapshot: snapshot as Prisma.InputJsonValue | undefined,
        },
      }),
    ]);

    const title = INCEPTION_DELIVERABLES.find((d) => d.key === key)!.title;
    await this.notifications.notify({
      userId: row.submittedById,
      projectId,
      type: 'DELIVERABLE_DECIDED',
      entityType: 'STAGE_DELIVERABLE',
      entityId: row.id,
      message: approve ? `${title} (v${row.version}) was approved` : `${title} needs revision: ${comment}`,
    });
    return this.list(projectId);
  }

  /** Called by every Stage 1 edit. A submitted or approved document goes
   * back to draft; an approved one also starts a new version. */
  async touch(projectId: string, key: DeliverableKey, userId: string) {
    const row = await this.prisma.stageDeliverable.findUnique({ where: { projectId_stage_key: { projectId, stage: 'INCEPTION', key } } });
    if (!row || (row.status !== 'SUBMITTED' && row.status !== 'APPROVED')) return;
    const version = row.status === 'APPROVED' ? row.version + 1 : row.version;
    await this.prisma.$transaction([
      this.prisma.stageDeliverable.update({ where: { id: row.id }, data: { status: 'DRAFT', version } }),
      this.prisma.stageDeliverableEvent.create({
        data: {
          deliverableId: row.id,
          type: 'REOPENED',
          version,
          actorId: userId,
          comment: row.status === 'APPROVED' ? `Edited after approval — now version ${version}` : 'Edited while awaiting the client — withdrawn',
        },
      }),
    ]);
  }

  /** Titles of the Stage 1 documents not yet approved by the client. */
  async outstanding(projectId: string) {
    const rows = await this.prisma.stageDeliverable.findMany({ where: { projectId, stage: 'INCEPTION', status: 'APPROVED' }, select: { key: true } });
    const approved = new Set(rows.map((r) => r.key));
    return INCEPTION_DELIVERABLES.filter((d) => !approved.has(d.key)).map((d) => d.title);
  }

  private async notifyApprovers(projectId: string, submitterId: string, deliverableId: string, key: DeliverableKey, projectName: string) {
    const title = INCEPTION_DELIVERABLES.find((d) => d.key === key)!.title;
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null } },
      include: { user: { select: { id: true, role: true, accountType: true } } },
    });
    const notified = new Set<string>();
    for (const m of members) {
      if (!m.user || m.user.id === submitterId || notified.has(m.user.id)) continue;
      const allowed = await this.permissions.can(m.user.role, m.user.accountType, m.user.id, projectId, 'PROJECT_DEFINITION', 'APPROVE');
      if (!allowed) continue;
      notified.add(m.user.id);
      await this.notifications.notify({
        userId: m.user.id,
        projectId,
        type: 'DELIVERABLE_SUBMITTED',
        entityType: 'STAGE_DELIVERABLE',
        entityId: deliverableId,
        message: `${projectName}: "${title}" is waiting for your approval`,
      });
    }
  }

  /** What exactly was approved, kept on the approval event. */
  private async snapshot(projectId: string, key: DeliverableKey): Promise<unknown> {
    const p = this.prisma;
    switch (key) {
      case 'BRIEF':
        return p.projectBrief.findUnique({ where: { projectId } });
      case 'SITE_ASSESSMENT':
        return {
          constraints: await p.siteConstraint.findMany({ where: { projectId } }),
          investigations: await p.siteInvestigation.findMany({ where: { projectId } }),
        };
      case 'DESKTOP_VIABILITY': {
        const s = await p.viabilityScenario.findFirst({ where: { projectId, isPreferred: true } });
        return s ? { scenario: s, result: computeViability(s) } : null;
      }
      case 'PROCUREMENT_POLICY':
        return {
          policy: await p.procurementPolicy.findUnique({ where: { projectId } }),
          contractForm: (await p.project.findUnique({ where: { id: projectId }, select: { contractForm: true } }))?.contractForm,
        };
      case 'CONSENTS_SCHEDULE':
        return p.consentApproval.findMany({ where: { projectId } });
      case 'PROFESSIONAL_TEAM':
        return p.organisationProjectAppointment.findMany({
          where: { projectId },
          select: {
            role: true,
            scopeOfWork: true,
            rolesAndResponsibilities: true,
            contractValue: true,
            currency: true,
            feeBasis: true,
            agreementStatus: true,
            contractor: { select: { name: true } },
          },
        });
      case 'INITIATION_PROGRAMME':
        return p.scheduleActivity.findMany({ where: { projectId }, select: { name: true, startDate: true, endDate: true, activityType: true } });
    }
  }
}
