import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { HiddenWorkStatus, NotificationType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { historyEntry, siteParty, type SiteParty } from '../common/site-party.js';
import type { ApproveHiddenWorkDto, HiddenWorkDto, RerequestHiddenWorkDto } from './dto/site-records.dto.js';

const INCLUDE = {
  contractor: { select: { id: true, name: true } },
  scheduleActivity: { select: { id: true, name: true } },
  inspector: { select: { id: true, role: true, userId: true, externalName: true, user: { select: { fullName: true } } } },
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { fullName: true } },
  ncrs: { select: { id: true, number: true, status: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.HiddenWorkInclude;
type Row = Prisma.HiddenWorkGetPayload<{ include: typeof INCLUDE }>;

const PENDING: HiddenWorkStatus[] = ['REQUESTED', 'REJECTED'];

/** Hidden-works sign-off (the user's choice, 2026-11-03; the donor app's
 * hidden-works register). Before work is covered up - drainage backfilled,
 * services ceiled in, waterproofing screeded - the contractor asks for it to
 * be inspected. The named inspector (or Setjeka or any quality person)
 * approves it once photos of it are on record, or turns it back; the
 * contractor then marks it covered. Work found covered first is recorded so,
 * and an NCR can be raised. The register is the record of what lies where. */
@Injectable()
export class HiddenWorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private sees(w: SiteParty, r: { contractorId: string | null; requestedById: string }) {
    return !w.contractor || r.requestedById === w.userId || Boolean(r.contractorId && w.contractorIds.has(r.contractorId));
  }

  private inspects(w: SiteParty, r: { inspectorId: string | null }) {
    return w.internal || (w.quality && (!r.inspectorId || w.memberIds.has(r.inspectorId)));
  }

  private shape(w: SiteParty, r: Row) {
    const mine = w.internal || (w.site && this.sees(w, r));
    return {
      ...r,
      photoCount: r._count.photos,
      can: {
        approve: this.inspects(w, r) && r.status === 'REQUESTED',
        reject: this.inspects(w, r) && r.status === 'REQUESTED',
        rerequest: mine && r.status === 'REJECTED',
        cover: mine && r.status === 'APPROVED',
        coveredUnapproved: w.quality && PENDING.includes(r.status),
        raiseNcr: w.quality && r.status === 'COVERED_UNAPPROVED' && !r.ncrs.some((n) => n.status !== 'VOID'),
        cancel: (w.quality || r.requestedById === w.userId) && PENDING.includes(r.status),
        addPhotos: mine && r.status !== 'CANCELLED',
      },
    };
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'HIDDEN_WORK', entityId: id, message });
    }
  }

  private async inspectorsFor(projectId: string, r: Row) {
    if (r.inspector?.userId) return [r.inspector.userId];
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['PROJECT_MANAGER', 'QA_QC_MANAGER'] }, userId: { not: null } }, select: { userId: true } });
    return rows.map((x) => x.userId);
  }

  private async contractorPeople(projectId: string, r: Row) {
    const rows = r.contractorId ? await this.prisma.projectMember.findMany({ where: { projectId, contractorId: r.contractorId, role: 'CONTRACTOR', userId: { not: null } }, select: { userId: true } }) : [];
    return [r.requestedById, ...rows.map((x) => x.userId)];
  }

  async list(projectId: string, userId: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const rows = await this.prisma.hiddenWork.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((r) => this.sees(w, r)).map((r) => this.shape(w, r));
  }

  private async load(w: SiteParty, projectId: string, id: string) {
    const r = await this.prisma.hiddenWork.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!r || !this.sees(w, r)) throw new NotFoundException('Hidden work not found');
    return r;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  async request(projectId: string, userId: string, dto: HiddenWorkDto) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    if (!w.site) throw new ForbiddenException('The contractor, the site team, the consultants or QA/QC ask for hidden works to be signed off');
    let contractorId = dto.contractorId ?? null;
    if (w.contractor) {
      if (contractorId && !w.contractorIds.has(contractorId)) throw new ForbiddenException('You ask for sign-off of your own work');
      contractorId = contractorId ?? [...w.contractorIds][0] ?? null;
    }
    if (contractorId && !(await this.prisma.projectMember.findFirst({ where: { projectId, contractorId } }))) throw new BadRequestException('That contractor is not on this project');
    if (dto.scheduleActivityId && !(await this.prisma.scheduleActivity.findFirst({ where: { id: dto.scheduleActivityId, projectId } }))) throw new BadRequestException('That activity is not on this project');
    if (dto.inspectorId) {
      const m = await this.prisma.projectMember.findFirst({ where: { id: dto.inspectorId, projectId }, select: { role: true } });
      if (!m || m.role === 'CLIENT' || m.role === 'CONTRACTOR') throw new BadRequestException('The inspector is a consultant, QA/QC or Setjeka on this project');
    }
    const last = await this.prisma.hiddenWork.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const r = await this.prisma.hiddenWork.create({
      data: {
        ...dto,
        contractorId,
        title: dto.title.trim(),
        trade: dto.trade?.trim() || null,
        location: dto.location?.trim() || null,
        asBuilt: dto.asBuilt?.trim() || null,
        readyAt: dto.readyAt ? new Date(dto.readyAt) : null,
        projectId,
        sequence,
        number: `HW-${String(sequence).padStart(3, '0')}`,
        requestedById: userId,
        history: [historyEntry(w, 'REQUESTED', 'Sign-off asked for')],
      },
      include: INCLUDE,
    });
    await this.tell(projectId, await this.inspectorsFor(projectId, r), userId, 'HIDDEN_WORK_REQUESTED', r.id, `${r.number} "${r.title}" is ready to inspect before it is covered${r.readyAt ? ` (${r.readyAt.toLocaleDateString('en-ZA')})` : ''}`);
    return this.shape(w, r);
  }

  private async move(w: SiteParty, r: Row, to: HiddenWorkStatus, comment: string | null | undefined, data: Prisma.HiddenWorkUncheckedUpdateInput = {}) {
    const history = [...((r.history as unknown[]) ?? []), historyEntry(w, to, comment)];
    await this.prisma.hiddenWork.update({ where: { id: r.id }, data: { ...data, status: to, history: history as Prisma.InputJsonValue } });
  }

  private async act(projectId: string, userId: string, id: string, can: keyof ReturnType<HiddenWorksService['shape']>['can'], refuse: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const r = await this.load(w, projectId, id);
    const shaped = this.shape(w, r);
    if (!shaped.can[can]) throw new BadRequestException(refuse.replace('{status}', r.status.toLowerCase().replace(/_/g, ' ')));
    return { w, r };
  }

  /** Approved: it may be covered. Photos of the work must be on record. */
  async approve(projectId: string, userId: string, id: string, dto: ApproveHiddenWorkDto) {
    const { w, r } = await this.act(projectId, userId, id, 'approve', 'Only work waiting for sign-off is approved, by its inspector or Setjeka ({status})');
    if (!r._count.photos) throw new BadRequestException('Add photos of the work before it is covered: they are the record of what is hidden');
    await this.move(w, r, 'APPROVED', dto.comment || 'Approved, may be covered', { decidedAt: new Date(), decidedById: userId, decisionComment: dto.comment?.trim() || null, asBuilt: dto.asBuilt?.trim() || undefined });
    await this.tell(projectId, await this.contractorPeople(projectId, r), userId, 'HIDDEN_WORK_DECIDED', id, `${r.number} "${r.title}" was approved: it may be covered`);
    return this.findOne(projectId, userId, id);
  }

  async reject(projectId: string, userId: string, id: string, reason: string) {
    const { w, r } = await this.act(projectId, userId, id, 'reject', 'Only work waiting for sign-off is turned back, by its inspector or Setjeka ({status})');
    await this.move(w, r, 'REJECTED', reason, { decidedAt: new Date(), decidedById: userId, decisionComment: reason.trim() });
    await this.tell(projectId, await this.contractorPeople(projectId, r), userId, 'HIDDEN_WORK_DECIDED', id, `${r.number} "${r.title}" must not be covered yet - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  /** Put right after being turned back: asked for again. */
  async rerequest(projectId: string, userId: string, id: string, dto: RerequestHiddenWorkDto) {
    const { w, r } = await this.act(projectId, userId, id, 'rerequest', 'Only work that was turned back is asked for again ({status})');
    await this.move(w, r, 'REQUESTED', dto.comment || 'Put right, ready to inspect again', { readyAt: dto.readyAt ? new Date(dto.readyAt) : undefined });
    await this.tell(projectId, await this.inspectorsFor(projectId, r), userId, 'HIDDEN_WORK_REQUESTED', id, `${r.number} "${r.title}" was put right and is ready to inspect again`);
    return this.findOne(projectId, userId, id);
  }

  async cover(projectId: string, userId: string, id: string, comment?: string) {
    const { w, r } = await this.act(projectId, userId, id, 'cover', 'It can be covered only once approved ({status})');
    await this.move(w, r, 'COVERED', comment || 'Covered', { coveredAt: new Date() });
    return this.findOne(projectId, userId, id);
  }

  /** Found covered before sign-off. */
  async coveredUnapproved(projectId: string, userId: string, id: string, reason: string) {
    const { w, r } = await this.act(projectId, userId, id, 'coveredUnapproved', 'Only work not yet signed off is recorded as covered without approval ({status})');
    await this.move(w, r, 'COVERED_UNAPPROVED', reason, { coveredAt: new Date(), decidedAt: new Date(), decidedById: userId, decisionComment: reason.trim() });
    await this.tell(projectId, await this.contractorPeople(projectId, r), userId, 'HIDDEN_WORK_DECIDED', id, `${r.number} "${r.title}" was covered before sign-off - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async cancel(projectId: string, userId: string, id: string, reason: string) {
    const { w, r } = await this.act(projectId, userId, id, 'cancel', 'Only a request not yet decided is cancelled ({status})');
    await this.move(w, r, 'CANCELLED', reason);
    return this.findOne(projectId, userId, id);
  }
}
