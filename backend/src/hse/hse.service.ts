import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { IncidentKind, IncidentSeverity, NotificationType, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { IncidentActionDto, InvestigateIncidentDto, ReportIncidentDto } from './dto/hse.dto.js';
import { diaryManHours } from '../site-diary/site-diary.service.js';

const INCLUDE = {
  contractor: { select: { id: true, name: true } },
  reportedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { fullName: true } },
  actions: { include: { owner: { select: { id: true, userId: true, externalName: true, user: { select: { fullName: true } } } } }, orderBy: { createdAt: 'asc' as const } },
  _count: { select: { photos: true } },
} satisfies Prisma.HseIncidentInclude;
type Row = Prisma.HseIncidentGetPayload<{ include: typeof INCLUDE }>;

const SERIOUS: IncidentSeverity[] = ['LOST_TIME', 'FATALITY'];
const DAY = 86_400_000;

/** Whether the OHS Act (section 24) wants the incident reported to the
 * Department of Employment and Labour: a death, or an injury that keeps
 * someone off work for more than 14 days, or a dangerous occurrence. A
 * starting suggestion; the HSE manager decides. */
export function reportableByDefault(kind: IncidentKind, severity: IncidentSeverity, lostDays?: number | null) {
  return severity === 'FATALITY' || kind === 'DANGEROUS_OCCURRENCE' || (severity === 'LOST_TIME' && (lostDays ?? 0) > 14);
}

/** HSE incidents (the user's choice from the role-by-role review,
 * 2026-11-04; incidents only, no near misses). Anyone on the site team
 * reports one; the HSE manager, Setjeka's PM or Setjeka investigates,
 * sets corrective actions with owners, records any report to the
 * Department, and closes it once the actions are done. A contractor sees
 * the incidents involving their firm or reported by them; the client sees
 * none. */
@Injectable()
export class HseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, fullName: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    if (!internal && !roles.some((r) => r !== 'CLIENT')) throw new NotFoundException('Not found');
    const manager = internal || roles.some((r) => ['HSE_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'].includes(r));
    return {
      userId,
      name: user?.fullName ?? 'Someone',
      internal,
      manager,
      memberIds: new Set(members.map((m) => m.id)),
      contractor: !manager && roles.includes('CONTRACTOR'),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    };
  }
  private sees(w: Awaited<ReturnType<HseService['who']>>, i: { contractorId: string | null; reportedById: string }) {
    return !w.contractor || i.reportedById === w.userId || Boolean(i.contractorId && w.contractorIds.has(i.contractorId));
  }

  private shape(w: Awaited<ReturnType<HseService['who']>>, i: Row) {
    const open = i.actions.filter((a) => !a.doneAt).length;
    return {
      ...i,
      photoCount: i._count.photos,
      openActions: open,
      serious: SERIOUS.includes(i.severity) || i.reportable,
      can: {
        investigate: w.manager && i.status !== 'CLOSED',
        addAction: w.manager && i.status !== 'CLOSED',
        close: w.manager && i.status !== 'CLOSED',
        completeAction: i.status !== 'CLOSED' ? i.actions.filter((a) => !a.doneAt && (w.manager || (a.ownerId && w.memberIds.has(a.ownerId)))).map((a) => a.id) : [],
        addPhotos: i.status !== 'CLOSED',
      },
    };
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'HSE_INCIDENT', entityId: id, message });
    }
  }

  private async managers(projectId: string, serious: boolean) {
    const roles: ProjectMemberRole[] = serious ? ['HSE_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'] : ['HSE_MANAGER', 'PROJECT_MANAGER'];
    return (await this.prisma.projectMember.findMany({ where: { projectId, role: { in: roles }, userId: { not: null } }, select: { userId: true } })).map((m) => m.userId);
  }

  private history(w: Awaited<ReturnType<HseService['who']>>, i: { history: unknown }, status: string, comment?: string | null) {
    return [...((i.history as unknown[]) ?? []), { status, at: new Date().toISOString(), by: w.userId, name: w.name, comment: comment?.trim() || null }] as Prisma.InputJsonValue;
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.hseIncident.findMany({ where: { projectId }, include: INCLUDE, orderBy: { occurredAt: 'desc' } });
    return rows.filter((i) => this.sees(w, i)).map((i) => this.shape(w, i));
  }

  /** The project's safety record: what has happened, and how long since the
   * last lost-time injury. */
  async stats(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const [all, project] = await Promise.all([
      this.prisma.hseIncident.findMany({ where: { projectId }, select: { severity: true, kind: true, status: true, occurredAt: true, lostDays: true, reportable: true, contractorId: true, reportedById: true } }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true, createdAt: true } }),
    ]);
    const rows = all.filter((i) => this.sees(w, i));
    const lti = rows.filter((i) => SERIOUS.includes(i.severity)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const since = lti[0]?.occurredAt ?? project?.startDate ?? project?.createdAt ?? new Date();
    const yearAgo = Date.now() - 365 * DAY;
    const bySeverity = Object.fromEntries((['NO_INJURY', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'FATALITY'] as IncidentSeverity[]).map((s) => [s, rows.filter((i) => i.severity === s).length]));
    return {
      total: rows.length,
      open: rows.filter((i) => i.status !== 'CLOSED').length,
      last12Months: rows.filter((i) => i.occurredAt.getTime() >= yearAgo).length,
      lostTimeInjuries: lti.length,
      lostDays: rows.reduce((s, i) => s + (i.lostDays ?? 0), 0),
      reportable: rows.filter((i) => i.reportable).length,
      daysSinceLostTime: Math.max(0, Math.floor((Date.now() - since.getTime()) / DAY)),
      // From the signed site diaries: people on site times the working day.
      ...(await (async () => {
        const manHours = Math.round(await diaryManHours(this.prisma, projectId));
        return { manHours, ltifr: manHours ? Math.round(((lti.length * 200_000) / manHours) * 100) / 100 : null };
      })()),
      sinceLostTimeFrom: lti[0] ? 'LAST_LOST_TIME' : 'PROJECT_START',
      bySeverity,
    };
  }

  private async load(w: Awaited<ReturnType<HseService['who']>>, projectId: string, id: string) {
    const i = await this.prisma.hseIncident.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!i || !this.sees(w, i)) throw new NotFoundException('Incident not found');
    return i;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  async report(projectId: string, userId: string, dto: ReportIncidentDto) {
    const w = await this.who(projectId, userId);
    let contractorId = dto.contractorId ?? null;
    if (w.contractor) {
      if (contractorId && !w.contractorIds.has(contractorId)) throw new ForbiddenException('You report incidents involving your own firm');
      contractorId = contractorId ?? [...w.contractorIds][0] ?? null;
    }
    if (contractorId && !(await this.prisma.projectMember.findFirst({ where: { projectId, contractorId } }))) throw new BadRequestException('That contractor is not on this project');
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now() + 3_600_000) throw new BadRequestException('An incident is reported after it happens');
    const last = await this.prisma.hseIncident.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const reportable = reportableByDefault(dto.kind, dto.severity, dto.lostDays);
    const i = await this.prisma.hseIncident.create({
      data: {
        ...dto,
        contractorId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        immediateAction: dto.immediateAction?.trim() || null,
        personsInvolved: dto.personsInvolved?.trim() || null,
        location: dto.location?.trim() || null,
        occurredAt,
        reportable,
        projectId,
        sequence,
        number: `INC-${String(sequence).padStart(3, '0')}`,
        reportedById: userId,
        history: [{ status: 'REPORTED', at: new Date().toISOString(), by: userId, name: w.name, comment: reportable ? 'To be reported to the Department of Employment and Labour' : null }],
      },
      include: INCLUDE,
    });
    const serious = SERIOUS.includes(i.severity) || reportable;
    await this.tell(projectId, await this.managers(projectId, serious), userId, 'INCIDENT_REPORTED', i.id, `${serious ? 'Serious incident' : 'Incident'} ${i.number}: ${i.title}${i.location ? ` at ${i.location}` : ''}${reportable ? ' - reportable to the Department of Employment and Labour' : ''}`);
    return this.shape(w, i);
  }

  async investigate(projectId: string, userId: string, id: string, dto: InvestigateIncidentDto) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.investigate) throw new ForbiddenException('The HSE manager or Setjeka investigates incidents');
    const severity = dto.severity ?? i.severity;
    const lostDays = dto.lostDays === undefined ? i.lostDays : dto.lostDays;
    const data: Prisma.HseIncidentUncheckedUpdateInput = {
      severity,
      lostDays,
      rootCause: dto.rootCause === undefined ? undefined : dto.rootCause.trim() || null,
      investigationNotes: dto.investigationNotes === undefined ? undefined : dto.investigationNotes.trim() || null,
      reportable: dto.reportable ?? (i.reportable || reportableByDefault(i.kind, severity, lostDays)),
      reportedToDelAt: dto.reportedToDelAt === undefined ? undefined : dto.reportedToDelAt ? new Date(dto.reportedToDelAt) : null,
      delReference: dto.delReference === undefined ? undefined : dto.delReference?.trim() || null,
      investigatedAt: new Date(),
    };
    const moved = i.status === 'REPORTED';
    await this.prisma.hseIncident.update({ where: { id }, data: { ...data, status: moved ? 'INVESTIGATING' : undefined, history: this.history(w, i, moved ? 'INVESTIGATING' : i.status, moved ? 'Investigation started' : 'Investigation updated') } });
    return this.findOne(projectId, userId, id);
  }

  async addAction(projectId: string, userId: string, id: string, dto: IncidentActionDto) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.addAction) throw new ForbiddenException('The HSE manager or Setjeka sets corrective actions');
    const owner = dto.ownerId ? await this.prisma.projectMember.findFirst({ where: { id: dto.ownerId, projectId }, select: { userId: true, role: true } }) : null;
    if (dto.ownerId && (!owner || owner.role === 'CLIENT')) throw new BadRequestException('The owner is someone on the site team');
    await this.prisma.incidentAction.create({ data: { incidentId: id, description: dto.description.trim(), ownerId: dto.ownerId ?? null, dueDate: dto.dueDate ? new Date(dto.dueDate) : null } });
    await this.prisma.hseIncident.update({ where: { id }, data: { status: 'ACTIONS_OPEN', history: this.history(w, i, 'ACTIONS_OPEN', `Corrective action: ${dto.description.trim()}`) } });
    await this.tell(projectId, [owner?.userId], userId, 'INCIDENT_ACTION_ASSIGNED', id, `${i.number} "${i.title}": a corrective action for you - ${dto.description.trim()}${dto.dueDate ? ` by ${new Date(dto.dueDate).toLocaleDateString('en-ZA')}` : ''}`);
    return this.findOne(projectId, userId, id);
  }

  async completeAction(projectId: string, userId: string, id: string, actionId: string, note?: string) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.completeAction.includes(actionId)) throw new BadRequestException('Only an open action is done, by its owner, the HSE manager or Setjeka');
    const a = i.actions.find((x) => x.id === actionId)!;
    await this.prisma.incidentAction.update({ where: { id: actionId }, data: { doneAt: new Date(), doneNote: note?.trim() || null } });
    await this.prisma.hseIncident.update({ where: { id }, data: { history: this.history(w, i, i.status, `Done: ${a.description}${note ? ` - ${note}` : ''}`) } });
    if (!w.manager) await this.tell(projectId, await this.managers(projectId, false), userId, 'INCIDENT_UPDATED', id, `${i.number}: the corrective action "${a.description}" is done`);
    return this.findOne(projectId, userId, id);
  }

  /** Closed once investigated, its actions done and any Department report
   * recorded. */
  async close(projectId: string, userId: string, id: string, note?: string) {
    const w = await this.who(projectId, userId);
    const i = await this.load(w, projectId, id);
    if (!this.shape(w, i).can.close) throw new ForbiddenException('The HSE manager or Setjeka closes incidents');
    if (!i.rootCause) throw new BadRequestException('Record the root cause before closing the incident');
    const open = i.actions.filter((a) => !a.doneAt).length;
    if (open) throw new BadRequestException(`${open} corrective action${open === 1 ? ' is' : 's are'} still open`);
    if (i.reportable && !i.reportedToDelAt) throw new BadRequestException('Record when it was reported to the Department of Employment and Labour');
    await this.prisma.hseIncident.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: userId, history: this.history(w, i, 'CLOSED', note) } });
    await this.tell(projectId, [i.reportedById], userId, 'INCIDENT_UPDATED', id, `${i.number} "${i.title}" was investigated and closed`);
    return this.findOne(projectId, userId, id);
  }
}

/** Open serious incidents on a project, for the portfolio. */
export async function openSeriousIncidents(prisma: PrismaService, projectId: string) {
  return prisma.hseIncident.count({ where: { projectId, status: { not: 'CLOSED' }, OR: [{ severity: { in: SERIOUS } }, { reportable: true }] } });
}
