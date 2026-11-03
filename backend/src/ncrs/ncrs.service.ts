import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { NcrStatus, NotificationType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { DESIGN_CONSULTANTS } from '../common/consultants.js';
import type { CreateNcrDto, RespondNcrDto, UpdateNcrDto } from './dto/ncr.dto.js';

const MEMBER = { select: { id: true, role: true, userId: true, externalName: true, contractorId: true, user: { select: { fullName: true } } } } as const;
const INCLUDE = {
  raisedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { fullName: true } },
  assignee: MEMBER,
  inspection: { select: { id: true, number: true, title: true } },
  testResult: { select: { id: true, number: true, title: true } },
  events: { include: { actor: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.NonConformanceInclude;

const OPEN_STATUSES: NcrStatus[] = ['OPEN', 'RESPONDED', 'ACTION_AGREED', 'READY_FOR_VERIFICATION'];

/** Non-conformance reports (register QHSE "NCR", Required: Yes; brought over
 * from OpenConstructionERP for the civil engineer, 29 Oct 2026). Setjeka or a
 * design consultant raises one to the contractor, often from a failed
 * inspection. The contractor gives the root cause and corrective action, the
 * raiser agrees it, the contractor puts it right and marks it ready, and the
 * raiser verifies and closes it. The client doesn't see NCRs, as with
 * inspections; a contractor sees only the ones issued to them. */
@Injectable()
export class NcrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    return {
      userId,
      internal,
      memberIds: new Set(members.map((m) => m.id)),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
      contractor: !internal && roles.includes('CONTRACTOR'),
      canRaise: internal || roles.some((r) => DESIGN_CONSULTANTS.includes(r) || r === 'QA_QC_MANAGER' || r === 'SITE_MANAGER'),
    };
  }

  /** The contractor it is issued to: the named person, or anyone from the
   * same contracting firm. */
  private isContractorFor(w: Awaited<ReturnType<NcrsService['who']>>, n: { assigneeId: string | null; assignee: { contractorId: string | null } | null }) {
    return Boolean(n.assigneeId && w.memberIds.has(n.assigneeId)) || Boolean(n.assignee?.contractorId && w.contractorIds.has(n.assignee.contractorId));
  }

  private isRaiser(w: Awaited<ReturnType<NcrsService['who']>>, n: { raisedById: string }) {
    return w.internal || n.raisedById === w.userId;
  }

  private shape(w: Awaited<ReturnType<NcrsService['who']>>, n: Prisma.NonConformanceGetPayload<{ include: typeof INCLUDE }>) {
    const raiser = this.isRaiser(w, n);
    const contractor = w.internal || this.isContractorFor(w, n);
    return {
      ...n,
      can: {
        edit: raiser && n.status === 'OPEN',
        respond: contractor && n.status === 'OPEN',
        agree: raiser && n.status === 'RESPONDED',
        reject: raiser && n.status === 'RESPONDED',
        ready: contractor && n.status === 'ACTION_AGREED',
        close: raiser && n.status === 'READY_FOR_VERIFICATION',
        reopen: raiser && n.status === 'READY_FOR_VERIFICATION',
        void: raiser && OPEN_STATUSES.includes(n.status),
      },
    };
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.nonConformance.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((n) => !w.contractor || this.isContractorFor(w, n)).map((n) => this.shape(w, n));
  }

  private async load(projectId: string, id: string) {
    const n = await this.prisma.nonConformance.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!n) throw new NotFoundException('NCR not found');
    return n;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const n = await this.load(projectId, id);
    if (w.contractor && !this.isContractorFor(w, n)) throw new NotFoundException('NCR not found');
    return this.shape(w, n);
  }

  private async assignee(projectId: string, memberId: string) {
    const m = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId }, select: { role: true } });
    if (!m) throw new BadRequestException('That person is not on this project');
    if (m.role !== 'CONTRACTOR') throw new BadRequestException('An NCR is issued to a contractor on the team');
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'NCR', entityId: id, message });
    }
  }

  async create(projectId: string, userId: string, dto: CreateNcrDto) {
    const w = await this.who(projectId, userId);
    if (!w.canRaise) throw new ForbiddenException('Setjeka and the design consultants raise NCRs');
    await this.assignee(projectId, dto.assigneeId);
    if (dto.inspectionId && !(await this.prisma.siteInspection.findFirst({ where: { id: dto.inspectionId, projectId } }))) throw new BadRequestException('Inspection not found on this project');
    if (dto.testResultId && !(await this.prisma.testResult.findFirst({ where: { id: dto.testResultId, projectId } }))) throw new BadRequestException('Test result not found on this project');
    const last = await this.prisma.nonConformance.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const n = await this.prisma.nonConformance.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description.trim(),
        location: dto.location?.trim() || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId,
        sequence,
        number: `NCR-${String(sequence).padStart(3, '0')}`,
        raisedById: userId,
        events: { create: { toStatus: 'OPEN', actorId: userId, comment: 'Raised' } },
      },
      include: INCLUDE,
    });
    await this.tell(projectId, [n.assignee?.userId], userId, 'NCR_ISSUED', n.id, `${n.number} "${n.title}" was issued to you: give the root cause and your corrective action${n.dueDate ? ` by ${n.dueDate.toLocaleDateString('en-ZA')}` : ''}`);
    return this.shape(w, n);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateNcrDto) {
    const w = await this.who(projectId, userId);
    const n = await this.load(projectId, id);
    if (!this.isRaiser(w, n)) throw new ForbiddenException('Only whoever raised the NCR, or Setjeka, changes it');
    if (n.status !== 'OPEN') throw new BadRequestException('Only an NCR the contractor has not answered yet can be changed');
    if (dto.assigneeId) await this.assignee(projectId, dto.assigneeId);
    await this.prisma.nonConformance.update({
      where: { id },
      data: { ...dto, dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null },
    });
    return this.findOne(projectId, userId, id);
  }

  private async move(projectId: string, userId: string, id: string, from: NcrStatus[], to: NcrStatus, comment: string | undefined, data: Prisma.NonConformanceUpdateInput = {}) {
    const n = await this.load(projectId, id);
    if (!from.includes(n.status)) throw new BadRequestException(`This NCR is ${n.status.toLowerCase().replace(/_/g, ' ')}, so it can't be moved to ${to.toLowerCase().replace(/_/g, ' ')}`);
    await this.prisma.nonConformance.update({ where: { id }, data: { ...data, status: to, events: { create: { fromStatus: n.status, toStatus: to, actorId: userId, comment: comment?.trim() || null } } } });
    return n;
  }

  /** The contractor answers: root cause, corrective and preventive action. */
  async respond(projectId: string, userId: string, id: string, dto: RespondNcrDto) {
    const w = await this.who(projectId, userId);
    const n = await this.load(projectId, id);
    if (!w.internal && !this.isContractorFor(w, n)) throw new ForbiddenException('The contractor it was issued to answers the NCR');
    await this.move(projectId, userId, id, ['OPEN'], 'RESPONDED', 'Root cause and corrective action given', {
      rootCauseCategory: dto.rootCauseCategory.trim(),
      rootCause: dto.rootCause.trim(),
      correctiveAction: dto.correctiveAction.trim(),
      preventiveAction: dto.preventiveAction?.trim() || null,
      respondedAt: new Date(),
    });
    await this.tell(projectId, [n.raisedById], userId, 'NCR_RESPONDED', id, `${n.number} "${n.title}": the contractor has given the root cause and corrective action for you to agree`);
    return this.findOne(projectId, userId, id);
  }

  private async raiserOnly(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    const n = await this.load(projectId, id);
    if (!this.isRaiser(w, n)) throw new ForbiddenException('Only whoever raised the NCR, or Setjeka, decides on it');
    return n;
  }

  async agree(projectId: string, userId: string, id: string, comment?: string) {
    const n = await this.raiserOnly(projectId, userId, id);
    await this.move(projectId, userId, id, ['RESPONDED'], 'ACTION_AGREED', comment || 'Corrective action agreed', { agreedAt: new Date() });
    await this.tell(projectId, [n.assignee?.userId], userId, 'NCR_DECIDED', id, `${n.number} "${n.title}": your corrective action was agreed. Mark it ready once the work is put right.`);
    return this.findOne(projectId, userId, id);
  }

  async reject(projectId: string, userId: string, id: string, reason: string) {
    const n = await this.raiserOnly(projectId, userId, id);
    await this.move(projectId, userId, id, ['RESPONDED'], 'OPEN', reason);
    await this.tell(projectId, [n.assignee?.userId], userId, 'NCR_DECIDED', id, `${n.number} "${n.title}": your corrective action was not accepted - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async ready(projectId: string, userId: string, id: string, comment?: string) {
    const w = await this.who(projectId, userId);
    const n = await this.load(projectId, id);
    if (!w.internal && !this.isContractorFor(w, n)) throw new ForbiddenException('The contractor it was issued to marks it ready');
    await this.move(projectId, userId, id, ['ACTION_AGREED'], 'READY_FOR_VERIFICATION', comment || 'Put right, ready to verify', { readyAt: new Date() });
    await this.tell(projectId, [n.raisedById], userId, 'NCR_READY', id, `${n.number} "${n.title}" is ready for you to verify on site`);
    return this.findOne(projectId, userId, id);
  }

  /** Verified on site: closed. The corrective action has to be on record. */
  async close(projectId: string, userId: string, id: string, comment?: string) {
    const n = await this.raiserOnly(projectId, userId, id);
    if (!n.correctiveAction) throw new BadRequestException('An NCR closes only with a corrective action on record');
    await this.move(projectId, userId, id, ['READY_FOR_VERIFICATION'], 'CLOSED', comment || 'Verified and closed', { closedAt: new Date(), closedBy: { connect: { id: userId } } });
    await this.tell(projectId, [n.assignee?.userId], userId, 'NCR_DECIDED', id, `${n.number} "${n.title}" was verified and closed`);
    return this.findOne(projectId, userId, id);
  }

  async reopen(projectId: string, userId: string, id: string, reason: string) {
    const n = await this.raiserOnly(projectId, userId, id);
    await this.move(projectId, userId, id, ['READY_FOR_VERIFICATION'], 'ACTION_AGREED', reason, { readyAt: null });
    await this.tell(projectId, [n.assignee?.userId], userId, 'NCR_DECIDED', id, `${n.number} "${n.title}" is not put right yet - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async void(projectId: string, userId: string, id: string, reason: string) {
    await this.raiserOnly(projectId, userId, id);
    await this.move(projectId, userId, id, OPEN_STATUSES, 'VOID', reason, { voidReason: reason.trim() });
    return this.findOne(projectId, userId, id);
  }
}
