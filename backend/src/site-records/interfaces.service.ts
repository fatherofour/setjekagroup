import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { InterfaceStatus, NotificationType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { historyEntry, siteParty, type SiteParty } from '../common/site-party.js';
import type { InterfaceDto } from './dto/site-records.dto.js';

const MEMBER = { select: { id: true, role: true, userId: true, externalName: true, contractorId: true, user: { select: { fullName: true } } } } as const;
const INCLUDE = {
  owner: MEMBER,
  accepter: MEMBER,
  scheduleActivity: { select: { id: true, name: true } },
  rfi: { select: { id: true, rfiNumber: true, title: true } },
  agreedBy: { select: { fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ProjectInterfaceInclude;
type Row = Prisma.ProjectInterfaceGetPayload<{ include: typeof INCLUDE }>;
type Side = Row['owner'];

const OPEN: InterfaceStatus[] = ['OPEN', 'PROPOSED'];
const name = (m: Side) => m.user?.fullName ?? m.externalName ?? 'Unnamed';

/** The interfaces register (the user's choice, 2026-11-03; the donor app's
 * interface_management). Each interface has an owner, who provides it and
 * proposes the agreed detail, and an accepter, who depends on it and agrees
 * it. Setjeka or a quality person closes it once built as agreed. Contractors
 * see the interfaces they are a side to, or raised. */
@Injectable()
export class InterfacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private onSide(w: SiteParty, m: Side) {
    return w.memberIds.has(m.id) || Boolean(m.contractorId && w.contractorIds.has(m.contractorId));
  }

  private sees(w: SiteParty, r: Row) {
    return !w.contractor || this.onSide(w, r.owner) || this.onSide(w, r.accepter) || r.createdById === w.userId;
  }

  private shape(w: SiteParty, r: Row) {
    const open = OPEN.includes(r.status);
    const owner = w.internal || this.onSide(w, r.owner);
    const accepter = w.internal || this.onSide(w, r.accepter);
    return {
      ...r,
      overdue: open && Boolean(r.needBy && r.needBy.getTime() < Date.now()),
      can: {
        propose: owner && r.status === 'OPEN',
        agree: accepter && r.status === 'PROPOSED',
        reject: accepter && r.status === 'PROPOSED',
        close: (w.quality || r.createdById === w.userId) && r.status === 'AGREED',
        cancel: (w.quality || r.createdById === w.userId) && open,
      },
    };
  }

  private async tell(projectId: string, sides: Side[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(sides.map((s) => s.userId).filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'INTERFACE', entityId: id, message });
    }
  }

  async options(projectId: string, userId: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const [members, activities, rfis] = await Promise.all([
      this.prisma.projectMember.findMany({ where: { projectId, role: { not: 'CLIENT' } }, select: { id: true, role: true, externalName: true, contractor: { select: { name: true } }, user: { select: { fullName: true } } } }),
      this.prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true, name: true }, orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.rfi.findMany({ where: { projectId }, select: { id: true, rfiNumber: true, title: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);
    return {
      members: members.map((m) => ({ id: m.id, role: m.role, name: m.user?.fullName ?? m.externalName ?? 'Unnamed', firm: m.contractor?.name ?? null })),
      activities,
      rfis,
      you: { contractor: w.contractor, quality: w.quality, site: w.site, memberIds: [...w.memberIds] },
    };
  }

  async list(projectId: string, userId: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const rows = await this.prisma.projectInterface.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((r) => this.sees(w, r)).map((r) => this.shape(w, r));
  }

  private async load(w: SiteParty, projectId: string, id: string) {
    const r = await this.prisma.projectInterface.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!r || !this.sees(w, r)) throw new NotFoundException('Interface not found');
    return r;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  async create(projectId: string, userId: string, dto: InterfaceDto) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    if (dto.ownerId === dto.accepterId) throw new BadRequestException('An interface is between two different parties');
    const sides = await this.prisma.projectMember.findMany({ where: { projectId, id: { in: [dto.ownerId, dto.accepterId] } }, select: { id: true, role: true, contractorId: true } });
    if (sides.length !== 2 || sides.some((s) => s.role === 'CLIENT')) throw new BadRequestException('Both sides must be on the project team');
    if (w.contractor && !sides.some((s) => w.memberIds.has(s.id) || (s.contractorId && w.contractorIds.has(s.contractorId)))) throw new ForbiddenException('A contractor raises interfaces they are a side to');
    if (dto.scheduleActivityId && !(await this.prisma.scheduleActivity.findFirst({ where: { id: dto.scheduleActivityId, projectId } }))) throw new BadRequestException('That activity is not on this project');
    if (dto.rfiId && !(await this.prisma.rfi.findFirst({ where: { id: dto.rfiId, projectId } }))) throw new BadRequestException('That RFI is not on this project');
    const last = await this.prisma.projectInterface.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const r = await this.prisma.projectInterface.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        location: dto.location?.trim() || null,
        needBy: dto.needBy ? new Date(dto.needBy) : null,
        projectId,
        sequence,
        number: `IF-${String(sequence).padStart(3, '0')}`,
        createdById: userId,
        history: [historyEntry(w, 'OPEN', 'Raised')],
      },
      include: INCLUDE,
    });
    await this.tell(projectId, [r.owner], userId, 'INTERFACE_RAISED', r.id, `${r.number} "${r.title}": you provide this to ${name(r.accepter)}. Propose the agreed detail${r.needBy ? ` by ${r.needBy.toLocaleDateString('en-ZA')}` : ''}.`);
    await this.tell(projectId, [r.accepter], userId, 'INTERFACE_RAISED', r.id, `${r.number} "${r.title}": an interface you depend on, from ${name(r.owner)}`);
    return this.shape(w, r);
  }

  private async move(w: SiteParty, r: Row, to: InterfaceStatus, comment: string | null | undefined, data: Prisma.ProjectInterfaceUncheckedUpdateInput = {}) {
    const history = [...((r.history as unknown[]) ?? []), historyEntry(w, to, comment)];
    await this.prisma.projectInterface.update({ where: { id: r.id }, data: { ...data, status: to, history: history as Prisma.InputJsonValue } });
  }

  async propose(projectId: string, userId: string, id: string, agreedDetail: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const r = await this.load(w, projectId, id);
    if (!this.shape(w, r).can.propose) throw (r.status === 'OPEN' ? new ForbiddenException(`${name(r.owner)}, who provides it, proposes the detail`) : new BadRequestException('A detail has already been proposed'));
    await this.move(w, r, 'PROPOSED', 'Detail proposed', { agreedDetail: agreedDetail.trim(), proposedAt: new Date(), rejectReason: null });
    await this.tell(projectId, [r.accepter], userId, 'INTERFACE_PROPOSED', id, `${r.number} "${r.title}": ${name(r.owner)} proposed the detail for you to agree`);
    return this.findOne(projectId, userId, id);
  }

  async agree(projectId: string, userId: string, id: string, comment?: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const r = await this.load(w, projectId, id);
    if (!this.shape(w, r).can.agree) throw (r.status === 'PROPOSED' ? new ForbiddenException(`${name(r.accepter)}, who depends on it, agrees it`) : new BadRequestException('There is no proposed detail to agree'));
    await this.move(w, r, 'AGREED', comment || 'Agreed', { agreedAt: new Date(), agreedById: userId });
    await this.tell(projectId, [r.owner], userId, 'INTERFACE_DECIDED', id, `${r.number} "${r.title}" was agreed by ${name(r.accepter)}`);
    return this.findOne(projectId, userId, id);
  }

  async reject(projectId: string, userId: string, id: string, reason: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const r = await this.load(w, projectId, id);
    if (!this.shape(w, r).can.reject) throw (r.status === 'PROPOSED' ? new ForbiddenException(`${name(r.accepter)}, who depends on it, decides on it`) : new BadRequestException('There is no proposed detail to turn down'));
    await this.move(w, r, 'OPEN', reason, { rejectReason: reason.trim() });
    await this.tell(projectId, [r.owner], userId, 'INTERFACE_DECIDED', id, `${r.number} "${r.title}": the detail was not agreed - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async close(projectId: string, userId: string, id: string, comment?: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const r = await this.load(w, projectId, id);
    if (r.status !== 'AGREED') throw new BadRequestException('Only an agreed interface is closed');
    if (!this.shape(w, r).can.close) throw new ForbiddenException('Setjeka, the consultants, QA/QC or whoever raised it closes it');
    await this.move(w, r, 'CLOSED', comment || 'Built as agreed', { closedAt: new Date() });
    return this.findOne(projectId, userId, id);
  }

  async cancel(projectId: string, userId: string, id: string, reason: string) {
    const w = await siteParty(this.prisma, this.projects, projectId, userId);
    const r = await this.load(w, projectId, id);
    if (!this.shape(w, r).can.cancel) throw new BadRequestException('This interface cannot be cancelled');
    await this.move(w, r, 'CANCELLED', reason, { cancelReason: reason.trim() });
    return this.findOne(projectId, userId, id);
  }
}
