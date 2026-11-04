import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PlantCategory, PlantStatus, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { siteDate } from '../site-diary/site-diary.service.js';
import type { AddPlantDto, InspectPlantDto, PlantOffSiteDto, PlantStatusDto, UpdatePlantDto } from './dto/plant.dto.js';

const INCLUDE = { contractor: { select: { id: true, name: true } }, addedBy: { select: { fullName: true } } } satisfies Prisma.PlantItemInclude;
type Row = Prisma.PlantItemGetPayload<{ include: typeof INCLUDE }>;

const MANAGERS: ProjectMemberRole[] = ['SITE_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER', 'HSE_MANAGER'];
/** Lifting machines and access equipment (cranes, hoists, MEWPs, scaffold
 * towers) carry a certificate: a load test or certificate of fitness. */
const CERTIFIED: PlantCategory[] = ['LIFTING', 'ACCESS'];
const DAY = 86_400_000;
const SOON_INSPECTION = 7;
const SOON_CERTIFICATE = 30;
const todaySa = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const daysTo = (d: Date, today: string) => Math.round((d.getTime() - siteDate(today).getTime()) / DAY);
const optDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? siteDate(v) : null);

/** Plant and equipment on site (the last of the site manager's items,
 * 2026-11-04). The site manager, Setjeka's PM or DM, the HSE manager or
 * Setjeka keeps the register; a contractor adds and updates their own
 * firm's plant. Each item records when it came and is due off hire, its
 * operator, whether it is working, standing or broken down, and when its
 * next inspection and certificate fall due; those are flagged as they come
 * up. A failed inspection takes it out of use until it passes one. The
 * client sees none of it. */
@Injectable()
export class PlantService {
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
    const manager = internal || roles.some((r) => MANAGERS.includes(r));
    return {
      userId,
      name: user?.fullName ?? 'Someone',
      manager,
      contractor: !manager && roles.includes('CONTRACTOR'),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    };
  }
  private sees(w: Awaited<ReturnType<PlantService['who']>>, p: { contractorId: string | null }) {
    return !w.contractor || Boolean(p.contractorId && w.contractorIds.has(p.contractorId));
  }

  private shape(w: Awaited<ReturnType<PlantService['who']>>, p: Row, today = todaySa()) {
    const onSite = p.status !== 'OFF_SITE';
    const flags: string[] = [];
    const due = (d: Date | null, soon: number, late: string, coming: string) => {
      if (!d || !onSite) return;
      const n = daysTo(d, today);
      if (n < 0) flags.push(late);
      else if (n <= soon) flags.push(coming);
    };
    due(p.nextInspectionDue, SOON_INSPECTION, 'INSPECTION_OVERDUE', 'INSPECTION_DUE');
    due(p.certificateExpiry, SOON_CERTIFICATE, 'CERTIFICATE_EXPIRED', 'CERTIFICATE_DUE');
    due(p.operatorCertExpiry, SOON_CERTIFICATE, 'OPERATOR_CERT_EXPIRED', 'OPERATOR_CERT_DUE');
    if (onSite && CERTIFIED.includes(p.category) && !p.certificateExpiry) flags.push('NO_CERTIFICATE');
    if (onSite && p.ownership === 'HIRED' && p.offHireDue && daysTo(p.offHireDue, today) < 0) flags.push('PAST_OFF_HIRE');
    if (p.outOfUse) flags.push('OUT_OF_USE');
    const edit = w.manager || (w.contractor && Boolean(p.contractorId && w.contractorIds.has(p.contractorId)));
    return {
      ...p,
      onSite,
      daysOnSite: Math.max(0, Math.round(((p.departedOn ?? siteDate(today)).getTime() - p.arrivedOn.getTime()) / DAY) + 1),
      flags,
      needsCertificate: CERTIFIED.includes(p.category),
      can: {
        edit: edit && onSite,
        status: edit && onSite,
        inspect: edit && onSite,
        offSite: edit && onSite,
      },
    };
  }

  private history(w: Awaited<ReturnType<PlantService['who']>>, p: { history: unknown }, kind: string, extra: Record<string, unknown> = {}) {
    return [...((p.history as unknown[]) ?? []), { kind, at: new Date().toISOString(), by: w.userId, name: w.name, ...extra }] as Prisma.InputJsonValue;
  }

  private async managers(projectId: string) {
    return (await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['SITE_MANAGER', 'PROJECT_MANAGER', 'HSE_MANAGER'] }, userId: { not: null } }, select: { userId: true } })).map((m) => m.userId);
  }

  private async tellOutOfUse(projectId: string, p: Row, except: string, message: string) {
    const firm = p.contractorId ? await this.prisma.projectMember.findMany({ where: { projectId, contractorId: p.contractorId, role: 'CONTRACTOR', userId: { not: null } }, select: { userId: true } }) : [];
    for (const u of new Set([...(await this.managers(projectId)), ...firm.map((m) => m.userId)].filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type: 'PLANT_OUT_OF_USE', entityType: 'PLANT_ITEM', entityId: p.id, message });
    }
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.plantItem.findMany({ where: { projectId }, include: INCLUDE, orderBy: [{ status: 'asc' }, { sequence: 'asc' }] });
    const today = todaySa();
    const shaped = rows.filter((p) => this.sees(w, p)).map((p) => this.shape(w, p, today));
    const on = shaped.filter((p) => p.onSite);
    const firms = await this.prisma.contractor.findMany({ where: { projectMembers: { some: { projectId } }, ...(w.manager ? {} : { id: { in: [...w.contractorIds] } }) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return {
      today,
      firms,
      plant: shaped,
      board: {
        onSite: on.length,
        working: on.filter((p) => p.status === 'WORKING').length,
        standing: on.filter((p) => p.status === 'STANDING').length,
        brokenDown: on.filter((p) => p.status === 'BROKEN_DOWN').length,
        inspectionsDue: on.filter((p) => p.flags.some((f) => f.startsWith('INSPECTION'))).length,
        certificates: on.filter((p) => p.flags.some((f) => f.startsWith('CERTIFICATE') || f.startsWith('OPERATOR') || f === 'NO_CERTIFICATE')).length,
        pastOffHire: on.filter((p) => p.flags.includes('PAST_OFF_HIRE')).length,
      },
      can: { add: w.manager || (w.contractor && w.contractorIds.size > 0), anyFirm: w.manager },
    };
  }

  private async load(w: Awaited<ReturnType<PlantService['who']>>, projectId: string, id: string) {
    const p = await this.prisma.plantItem.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!p || !this.sees(w, p)) throw new NotFoundException('Plant not found');
    return p;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  async add(projectId: string, userId: string, dto: AddPlantDto) {
    const w = await this.who(projectId, userId);
    let contractorId = dto.contractorId ?? null;
    if (!w.manager) {
      if (!w.contractor) throw new ForbiddenException('The site manager, Setjeka’s PM or DM, the HSE manager or Setjeka keeps the plant register');
      if (contractorId && !w.contractorIds.has(contractorId)) throw new ForbiddenException('You add your own firm’s plant');
      contractorId = contractorId ?? [...w.contractorIds][0] ?? null;
    }
    if (contractorId && !(await this.prisma.projectMember.findFirst({ where: { projectId, contractorId } }))) throw new BadRequestException('That contractor is not on this project');
    const today = todaySa();
    if (dto.arrivedOn > today) throw new BadRequestException('Add plant once it is on site');
    if (dto.offHireDue && dto.offHireDue < dto.arrivedOn) throw new BadRequestException('It is due off hire after it arrives');
    const inspected = dto.lastInspectedOn ? siteDate(dto.lastInspectedOn) : null;
    const next = dto.nextInspectionDue ? siteDate(dto.nextInspectionDue) : inspected && dto.inspectionIntervalDays ? new Date(inspected.getTime() + dto.inspectionIntervalDays * DAY) : null;
    const last = await this.prisma.plantItem.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const p = await this.prisma.plantItem.create({
      data: {
        projectId,
        sequence,
        number: `PL-${String(sequence).padStart(3, '0')}`,
        description: dto.description.trim(),
        category: dto.category,
        fleetNumber: dto.fleetNumber?.trim() || null,
        ownership: dto.ownership ?? 'HIRED',
        supplier: dto.supplier?.trim() || null,
        contractorId,
        operator: dto.operator?.trim() || null,
        operatorCertExpiry: optDate(dto.operatorCertExpiry) ?? null,
        arrivedOn: siteDate(dto.arrivedOn),
        offHireDue: optDate(dto.offHireDue) ?? null,
        inspectionIntervalDays: dto.inspectionIntervalDays ?? null,
        lastInspectedOn: inspected,
        nextInspectionDue: next,
        certificateExpiry: optDate(dto.certificateExpiry) ?? null,
        addedById: userId,
        history: [{ kind: 'ARRIVED', at: new Date().toISOString(), by: userId, name: w.name, date: dto.arrivedOn }],
      },
      include: INCLUDE,
    });
    return this.shape(w, p);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdatePlantDto) {
    const w = await this.who(projectId, userId);
    const p = await this.load(w, projectId, id);
    if (!this.shape(w, p).can.edit) throw new BadRequestException('Only plant still on site is changed, by whoever keeps it');
    if (dto.arrivedOn && dto.arrivedOn > todaySa()) throw new BadRequestException('It cannot arrive in the future');
    const arrived = dto.arrivedOn ?? iso(p.arrivedOn)!;
    const offHire = dto.offHireDue === undefined ? iso(p.offHireDue) : dto.offHireDue;
    if (offHire && offHire < arrived) throw new BadRequestException('It is due off hire after it arrives');
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    const updated = await this.prisma.plantItem.update({
      where: { id },
      data: {
        description: dto.description?.trim() || undefined,
        category: dto.category,
        fleetNumber: clean(dto.fleetNumber),
        ownership: dto.ownership,
        supplier: clean(dto.supplier),
        operator: clean(dto.operator),
        operatorCertExpiry: optDate(dto.operatorCertExpiry),
        arrivedOn: dto.arrivedOn ? siteDate(dto.arrivedOn) : undefined,
        offHireDue: optDate(dto.offHireDue),
        inspectionIntervalDays: dto.inspectionIntervalDays,
        nextInspectionDue: optDate(dto.nextInspectionDue),
        certificateExpiry: optDate(dto.certificateExpiry),
        history: dto.operator !== undefined && clean(dto.operator) !== p.operator ? this.history(w, p, 'OPERATOR', { operator: clean(dto.operator) }) : undefined,
      },
      include: INCLUDE,
    });
    return this.shape(w, updated);
  }

  /** Working, standing or broken down. */
  async setStatus(projectId: string, userId: string, id: string, dto: PlantStatusDto) {
    const w = await this.who(projectId, userId);
    const p = await this.load(w, projectId, id);
    if (!this.shape(w, p).can.status) throw new BadRequestException('Only plant on site changes state, by whoever keeps it');
    if (dto.status === p.status) throw new BadRequestException('It is already in that state');
    const note = dto.note?.trim() || null;
    if (dto.status === 'BROKEN_DOWN' && !note) throw new BadRequestException('Say what is wrong with it');
    if (p.outOfUse && dto.status === 'WORKING') throw new BadRequestException('It failed its last inspection: record a passed inspection before it works again');
    const updated = await this.prisma.plantItem.update({ where: { id }, data: { status: dto.status, history: this.history(w, p, 'STATUS', { from: p.status, to: dto.status, note }) }, include: INCLUDE });
    if (dto.status === 'BROKEN_DOWN') await this.tellOutOfUse(projectId, updated, userId, `${p.number} ${p.description} has broken down - ${note}`);
    return this.shape(w, updated);
  }

  /** An inspection: passed, the next one falls due; failed, the plant is
   * out of use (broken down) until it passes one. */
  async inspect(projectId: string, userId: string, id: string, dto: InspectPlantDto) {
    const w = await this.who(projectId, userId);
    const p = await this.load(w, projectId, id);
    if (!this.shape(w, p).can.inspect) throw new BadRequestException('Only plant on site is inspected here');
    if (dto.date > todaySa()) throw new BadRequestException('Record an inspection once it is done');
    if (dto.date < iso(p.arrivedOn)!) throw new BadRequestException('The inspection is after it arrived');
    const note = dto.note?.trim() || null;
    if (!dto.passed && !note) throw new BadRequestException('Say what failed');
    const date = siteDate(dto.date);
    const interval = dto.intervalDays ?? p.inspectionIntervalDays;
    const next = dto.nextDue ? siteDate(dto.nextDue) : interval ? new Date(date.getTime() + interval * DAY) : null;
    if (next && next <= date) throw new BadRequestException('The next inspection falls after this one');
    const data: Prisma.PlantItemUncheckedUpdateInput = {
      lastInspectedOn: date,
      inspectionIntervalDays: interval ?? null,
      certificateExpiry: optDate(dto.certificateExpiry),
      history: this.history(w, p, 'INSPECTED', { date: dto.date, passed: dto.passed, inspector: dto.inspector?.trim() || null, next: iso(next), note }),
    };
    if (dto.passed) {
      data.nextInspectionDue = next;
      data.outOfUse = false;
      if (p.outOfUse && p.status === 'BROKEN_DOWN') data.status = 'WORKING' satisfies PlantStatus;
    } else {
      data.outOfUse = true;
      data.status = 'BROKEN_DOWN';
    }
    const updated = await this.prisma.plantItem.update({ where: { id }, data, include: INCLUDE });
    if (!dto.passed) await this.tellOutOfUse(projectId, updated, userId, `${p.number} ${p.description} failed its inspection and is out of use - ${note}`);
    return this.shape(w, updated);
  }

  async offSite(projectId: string, userId: string, id: string, dto: PlantOffSiteDto) {
    const w = await this.who(projectId, userId);
    const p = await this.load(w, projectId, id);
    if (!this.shape(w, p).can.offSite) throw new BadRequestException('It is already off site');
    if (dto.date > todaySa()) throw new BadRequestException('Record it once it has left');
    if (dto.date < iso(p.arrivedOn)!) throw new BadRequestException('It leaves after it arrived');
    const updated = await this.prisma.plantItem.update({
      where: { id },
      data: { status: 'OFF_SITE', departedOn: siteDate(dto.date), history: this.history(w, p, 'OFF_SITE', { date: dto.date, note: dto.note?.trim() || null }) },
      include: INCLUDE,
    });
    return this.shape(w, updated);
  }
}

/** The plant on site on a day, grouped for the diary: description, count
 * and state. Empty when the register has nothing for the day. */
export async function plantOnSite(prisma: PrismaService, projectId: string, date: Date) {
  const rows = await prisma.plantItem.findMany({
    where: { projectId, arrivedOn: { lte: date }, OR: [{ departedOn: null }, { departedOn: { gte: date } }] },
    select: { description: true, status: true },
    orderBy: { sequence: 'asc' },
  });
  const groups = new Map<string, { description: string; count: number; state: string }>();
  for (const r of rows) {
    const state = r.status === 'OFF_SITE' ? 'WORKING' : r.status;
    const key = `${r.description.toLowerCase()}|${state}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { description: r.description, count: 1, state });
  }
  return [...groups.values()];
}
