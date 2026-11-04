import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Country, NotificationType, PermitStatus, PermitType, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { projectCountry, rulesFor } from '../common/countries.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { RequestPermitDto } from './dto/permits.dto.js';

/** The precautions each type of permit asks to be confirmed, from the usual
 * South African practice (the Construction Regulations 2014 and the
 * Electrical Installation Regulations). A starting list; more can be added
 * on the permit. */
export const PERMIT_CHECKS: Record<PermitType, string[]> = {
  HOT_WORK: ['Combustibles cleared or covered within 10 m', 'Fire extinguisher at the work', 'Fire watch during the work and for 60 minutes after', 'Gas cylinders secured, with flashback arrestors fitted'],
  WORKING_AT_HEIGHT: ['Fall protection plan in place (Construction Regulations, reg. 10)', 'Harnesses inspected and anchor points identified', 'Edge protection or scaffold inspected and tagged', 'Rescue plan in place', 'Area below barricaded'],
  EXCAVATION: ['Underground services located and marked', 'Sides shored, battered or benched (Construction Regulations, reg. 13)', 'Barricades and signs around the excavation', 'Safe access and egress (ladder)', 'Spoil kept 1 m back from the edge'],
  CONFINED_SPACE: ['Atmosphere gas-tested before entry', 'Ventilation in place', 'Standby person at the entrance', 'Rescue equipment and plan ready', 'Isolations locked out'],
  ELECTRICAL_ISOLATION: ['Circuit identified and isolated', 'Lock-out and tag-out applied', 'Tested dead before work starts', 'Competent person appointed (Electrical Installation Regulations)'],
  LIFTING: ['Lift plan prepared', 'Crane and lifting tackle inspected and certified', 'Operator and rigger competent', 'Exclusion zone set up', 'Wind speed within the crane limit'],
  OTHER: ['Risk assessment done for the task', 'Workers briefed on the precautions'],
};

/** The precautions as they read in the project's country: the South
 * African regulations are cited only on South African projects. */
export function permitChecks(country: Country): Record<PermitType, string[]> {
  if (rulesFor(country).citeSaRegulations) return PERMIT_CHECKS;
  const plain = (t: string) => t.replace(/ \((?:Construction Regulations|Electrical Installation Regulations)[^)]*\)/, '');
  return Object.fromEntries(Object.entries(PERMIT_CHECKS).map(([k, v]) => [k, v.map(plain)])) as Record<PermitType, string[]>;
}

const INCLUDE = {
  contractor: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, fullName: true } },
  issuedBy: { select: { fullName: true } },
} satisfies Prisma.WorkPermitInclude;
type Row = Prisma.WorkPermitGetPayload<{ include: typeof INCLUDE }>;

const ISSUERS: ProjectMemberRole[] = ['HSE_MANAGER', 'SITE_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'];
const OPEN: PermitStatus[] = ['ISSUED', 'SUSPENDED'];
const MAX_DAYS = 7;
const day = (d: Date) => d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Permits to work (the user's choice from the role-by-role review,
 * 2026-11-04). The contractor or site team asks for a permit with the type's
 * precautions confirmed; the HSE manager, the site manager or Setjeka issues
 * it (or turns it down), can suspend and reinstate it, and closes it once it
 * is handed back with the area made safe. A permit runs for at most seven
 * days. The client sees none; a contractor sees their own firm's. */
@Injectable()
export class PermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true, fullName: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true, contractorId: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = members.map((m) => m.role);
    if (!internal && !roles.some((r) => r !== 'CLIENT')) throw new NotFoundException('Not found');
    const issuer = internal || roles.some((r) => ISSUERS.includes(r));
    return {
      userId,
      name: user?.fullName ?? 'Someone',
      issuer,
      contractor: !issuer && roles.includes('CONTRACTOR'),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    };
  }
  private sees(w: Awaited<ReturnType<PermitsService['who']>>, p: { contractorId: string | null; requestedById: string }) {
    return !w.contractor || p.requestedById === w.userId || Boolean(p.contractorId && w.contractorIds.has(p.contractorId));
  }

  private shape(w: Awaited<ReturnType<PermitsService['who']>>, p: Row) {
    const now = Date.now();
    const holder = p.requestedById === w.userId || (w.contractor && Boolean(p.contractorId && w.contractorIds.has(p.contractorId)));
    return {
      ...p,
      live: p.status === 'ISSUED' && p.validFrom.getTime() <= now && p.validTo.getTime() >= now,
      expired: OPEN.includes(p.status) && p.validTo.getTime() < now,
      can: {
        issue: w.issuer && p.status === 'REQUESTED',
        reject: w.issuer && p.status === 'REQUESTED',
        suspend: w.issuer && p.status === 'ISSUED',
        reinstate: w.issuer && p.status === 'SUSPENDED' && p.validTo.getTime() > now,
        handBack: (holder || w.issuer) && OPEN.includes(p.status),
        close: w.issuer && p.status === 'HANDED_BACK',
        cancel: (holder || w.issuer) && p.status === 'REQUESTED',
      },
    };
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, id: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'WORK_PERMIT', entityId: id, message });
    }
  }

  private async issuers(projectId: string) {
    return (await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['HSE_MANAGER', 'SITE_MANAGER', 'PROJECT_MANAGER'] }, userId: { not: null } }, select: { userId: true } })).map((m) => m.userId);
  }

  private async holders(projectId: string, p: Row) {
    const firm = p.contractorId ? await this.prisma.projectMember.findMany({ where: { projectId, contractorId: p.contractorId, role: 'CONTRACTOR', userId: { not: null } }, select: { userId: true } }) : [];
    return [p.requestedById, ...firm.map((m) => m.userId)];
  }

  private history(w: Awaited<ReturnType<PermitsService['who']>>, p: { history: unknown }, status: string, comment?: string | null) {
    return [...((p.history as unknown[]) ?? []), { status, at: new Date().toISOString(), by: w.userId, name: w.name, comment: comment?.trim() || null }] as Prisma.InputJsonValue;
  }

  /** The type's precautions, for the request form. */
  async checks(projectId: string) {
    return permitChecks(await projectCountry(this.prisma, projectId));
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.workPermit.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'desc' } });
    const shaped = rows.filter((p) => this.sees(w, p)).map((p) => this.shape(w, p));
    return {
      permits: shaped,
      board: {
        live: shaped.filter((p) => p.live).length,
        awaiting: shaped.filter((p) => p.status === 'REQUESTED').length,
        suspended: shaped.filter((p) => p.status === 'SUSPENDED').length,
        expired: shaped.filter((p) => p.expired).length,
        toClose: shaped.filter((p) => p.status === 'HANDED_BACK').length,
      },
      can: { request: true, issue: w.issuer },
    };
  }

  private async load(w: Awaited<ReturnType<PermitsService['who']>>, projectId: string, id: string) {
    const p = await this.prisma.workPermit.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!p || !this.sees(w, p)) throw new NotFoundException('Permit not found');
    return p;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  async request(projectId: string, userId: string, dto: RequestPermitDto) {
    const w = await this.who(projectId, userId);
    let contractorId = dto.contractorId ?? null;
    if (w.contractor) {
      if (contractorId && !w.contractorIds.has(contractorId)) throw new ForbiddenException('You ask for permits for your own firm');
      contractorId = contractorId ?? [...w.contractorIds][0] ?? null;
    }
    if (contractorId && !(await this.prisma.projectMember.findFirst({ where: { projectId, contractorId } }))) throw new BadRequestException('That contractor is not on this project');
    const from = new Date(dto.validFrom);
    const to = new Date(dto.validTo);
    if (to <= from) throw new BadRequestException('A permit ends after it starts');
    if (to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) throw new BadRequestException(`A permit runs for at most ${MAX_DAYS} days; ask for a new one after that`);
    if (to.getTime() < Date.now()) throw new BadRequestException('That period is already over');
    const required = permitChecks(await projectCountry(this.prisma, projectId))[dto.type];
    const missing = required.filter((t) => !dto.checklist.some((c) => c.text === t && c.done));
    if (missing.length) throw new BadRequestException(`Confirm every precaution first: ${missing.join('; ')}`);
    if (dto.checklist.some((c) => !c.done)) throw new BadRequestException('Confirm every precaution on the list, or take off the ones that do not apply');
    if (dto.type === 'CONFINED_SPACE' && !dto.gasTest?.trim()) throw new BadRequestException('Record the gas test for a confined space');
    const last = await this.prisma.workPermit.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const p = await this.prisma.workPermit.create({
      data: {
        ...dto,
        contractorId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        location: dto.location.trim(),
        workers: dto.workers?.trim() || null,
        gasTest: dto.gasTest?.trim() || null,
        validFrom: from,
        validTo: to,
        checklist: dto.checklist.map((c) => ({ text: c.text.trim(), done: c.done })) as Prisma.InputJsonValue,
        projectId,
        sequence,
        number: `PTW-${String(sequence).padStart(3, '0')}`,
        requestedById: userId,
        history: [{ status: 'REQUESTED', at: new Date().toISOString(), by: userId, name: w.name, comment: null }],
      },
      include: INCLUDE,
    });
    await this.tell(projectId, await this.issuers(projectId), userId, 'PERMIT_REQUESTED', p.id, `${p.number}: a permit for ${p.title} at ${p.location} is waiting to be issued (${day(from)} to ${day(to)})`);
    return this.shape(w, p);
  }

  private async move(projectId: string, userId: string, id: string, can: keyof ReturnType<PermitsService['shape']>['can'], refuse: string, to: PermitStatus, comment: string | null | undefined, data: Prisma.WorkPermitUncheckedUpdateInput = {}) {
    const w = await this.who(projectId, userId);
    const p = await this.load(w, projectId, id);
    if (!this.shape(w, p).can[can]) throw new BadRequestException(refuse);
    const updated = await this.prisma.workPermit.update({ where: { id }, data: { ...data, status: to, history: this.history(w, p, to, comment) }, include: INCLUDE });
    return { w, p: updated };
  }

  async issue(projectId: string, userId: string, id: string, conditions?: string) {
    const existing = await this.prisma.workPermit.findFirst({ where: { id, projectId }, select: { validTo: true } });
    if (existing && existing.validTo.getTime() < Date.now()) throw new BadRequestException('The period asked for is over; ask for a new permit');
    const { p } = await this.move(projectId, userId, id, 'issue', 'Only a permit asked for is issued, by the HSE manager, the site manager or Setjeka', 'ISSUED', conditions, { issuedById: userId, issuedAt: new Date(), conditions: conditions?.trim() || null });
    await this.tell(projectId, await this.holders(projectId, p), userId, 'PERMIT_DECIDED', id, `${p.number} for ${p.title} is issued: work may go ahead ${day(p.validFrom)} to ${day(p.validTo)}${p.conditions ? `. Conditions: ${p.conditions}` : ''}`);
    return this.findOne(projectId, userId, id);
  }

  async reject(projectId: string, userId: string, id: string, reason: string) {
    const { p } = await this.move(projectId, userId, id, 'reject', 'Only a permit asked for is turned down, by the HSE manager, the site manager or Setjeka', 'REJECTED', reason, { reason: reason.trim() });
    await this.tell(projectId, await this.holders(projectId, p), userId, 'PERMIT_DECIDED', id, `${p.number} for ${p.title} was not issued - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async suspend(projectId: string, userId: string, id: string, reason: string) {
    const { p } = await this.move(projectId, userId, id, 'suspend', 'Only an issued permit is suspended', 'SUSPENDED', reason, { reason: reason.trim() });
    await this.tell(projectId, await this.holders(projectId, p), userId, 'PERMIT_DECIDED', id, `${p.number} for ${p.title} is SUSPENDED: stop the work - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async reinstate(projectId: string, userId: string, id: string, note?: string) {
    const { p } = await this.move(projectId, userId, id, 'reinstate', 'Only a suspended permit still in its period is reinstated', 'ISSUED', note || 'Reinstated', { reason: null });
    await this.tell(projectId, await this.holders(projectId, p), userId, 'PERMIT_DECIDED', id, `${p.number} for ${p.title} is reinstated: work may carry on`);
    return this.findOne(projectId, userId, id);
  }

  /** The work is done (or stopped) and the area made safe. */
  async handBack(projectId: string, userId: string, id: string, note?: string) {
    const { p } = await this.move(projectId, userId, id, 'handBack', 'Only an issued or suspended permit is handed back', 'HANDED_BACK', note || 'Work done, area made safe', { handedBackAt: new Date(), handBackNote: note?.trim() || null });
    await this.tell(projectId, [p.issuedById, ...(await this.issuers(projectId))], userId, 'PERMIT_HANDED_BACK', id, `${p.number} for ${p.title} was handed back: check the area and close it`);
    return this.findOne(projectId, userId, id);
  }

  async close(projectId: string, userId: string, id: string, note?: string) {
    const { p } = await this.move(projectId, userId, id, 'close', 'Only a handed-back permit is closed, by the HSE manager, the site manager or Setjeka', 'CLOSED', note, { closedAt: new Date() });
    await this.tell(projectId, await this.holders(projectId, p), userId, 'PERMIT_DECIDED', id, `${p.number} for ${p.title} is closed`);
    return this.findOne(projectId, userId, id);
  }

  async cancel(projectId: string, userId: string, id: string, reason: string) {
    await this.move(projectId, userId, id, 'cancel', 'Only a permit not yet issued is cancelled', 'CANCELLED', reason, { reason: reason.trim() });
    return this.findOne(projectId, userId, id);
  }
}

/** Issued or suspended permits past their end, not handed back: for the
 * portfolio. */
export async function expiredOpenPermits(prisma: PrismaService, projectId: string) {
  return prisma.workPermit.count({ where: { projectId, status: { in: OPEN }, validTo: { lt: new Date() } } });
}
