import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { InspectionKind } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ChecklistItemDto, CompleteInspectionDto, CreateInspectionDto, InspectionIssueDto, InspectionQuery, TemplateDto, UpdateInspectionDto } from './dto/inspection.dto.js';

export const KIND_LABEL: Record<InspectionKind, string> = {
  QUALITY: 'Quality inspection',
  DESIGN_SUPERVISION: "Architect's site inspection",
  TEST_WITNESS: 'Test witnessed',
  MOCK_UP: 'Mock-up review',
  PRACTICAL_COMPLETION: 'Practical completion inspection',
  DEFECTS_VERIFICATION: 'Defects verification',
};

type Item = { text: string; result: 'PASS' | 'FAIL' | 'NA' | null; note: string | null; issueId?: string | null };

const INCLUDE = {
  requestedBy: { select: { id: true, fullName: true } },
  completedBy: { select: { id: true, fullName: true } },
  inspector: { select: { id: true, role: true, externalName: true, userId: true, user: { select: { fullName: true } } } },
  template: { select: { id: true, name: true } },
  issues: { select: { id: true, title: true, status: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.SiteInspectionInclude;

const clean = (items: ChecklistItemDto[]): Item[] => items.map((i) => ({ text: i.text.trim(), result: i.result ?? null, note: i.note?.trim() || null }));

/** Inspection requests and site inspections with checklists (register QHSE
 * rows 66-67, built now at the user's word on 26 Oct 2026), and the
 * architect's PROCSA 5.5, 5.8, 5.13 and 6.1. A contractor requests one,
 * Setjeka or a consultant schedules it, the inspector records each checklist
 * item and the outcome, and anything that fails becomes an issue. */
@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, roles] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true } }),
    ]);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    return { userId, internal, memberIds: roles.map((r) => r.id), contractorOnly: !internal && roles.length > 0 && roles.every((r) => r.role === 'CONTRACTOR') };
  }

  private async inspectorMember(projectId: string, memberId: string) {
    const m = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId }, select: { id: true, role: true, userId: true } });
    if (!m || m.role === 'CLIENT') throw new BadRequestException('The inspector must be on the project team');
    return m;
  }

  private async leads(projectId: string) {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'] }, userId: { not: null } }, select: { userId: true } });
    return [...new Set(rows.map((r) => r.userId!))];
  }

  private async templateItems(templateId: string | null | undefined): Promise<Item[]> {
    if (!templateId) return [];
    const t = await this.prisma.inspectionTemplate.findUnique({ where: { id: templateId } });
    if (!t) throw new BadRequestException('Checklist not found');
    return t.items.map((text) => ({ text, result: null, note: null }));
  }

  private shape(me: Awaited<ReturnType<InspectionsService['who']>>, i: Prisma.SiteInspectionGetPayload<{ include: typeof INCLUDE }>) {
    const isInspector = Boolean(i.inspectorId && me.memberIds.includes(i.inspectorId));
    const open = i.status === 'REQUESTED' || i.status === 'SCHEDULED';
    const checklist = (i.checklist as Item[]) ?? [];
    return {
      ...i,
      kindLabel: KIND_LABEL[i.kind],
      checklist,
      tally: { pass: checklist.filter((c) => c.result === 'PASS').length, fail: checklist.filter((c) => c.result === 'FAIL').length, na: checklist.filter((c) => c.result === 'NA').length, open: checklist.filter((c) => !c.result).length },
      inspectorName: i.inspector ? (i.inspector.user?.fullName ?? i.inspector.externalName ?? '—') : null,
      photoCount: i._count.photos,
      can: {
        schedule: open && !me.contractorOnly,
        record: open && (me.internal || isInspector),
        cancel: open && (me.internal || i.requestedById === me.userId),
        raiseIssue: !me.contractorOnly && i.status !== 'CANCELLED',
      },
    };
  }

  async list(projectId: string, userId: string, q: InspectionQuery) {
    const me = await this.who(projectId, userId);
    const rows = await this.prisma.siteInspection.findMany({
      where: { projectId, ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}) },
      include: INCLUDE,
      orderBy: [{ sequence: 'desc' }],
    });
    return rows.map((r) => this.shape(me, r));
  }

  private async load(projectId: string, id: string) {
    const i = await this.prisma.siteInspection.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!i) throw new NotFoundException('Inspection not found');
    return i;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const me = await this.who(projectId, userId);
    return this.shape(me, await this.load(projectId, id));
  }

  async create(projectId: string, userId: string, dto: CreateInspectionDto) {
    const me = await this.who(projectId, userId);
    const items = await this.templateItems(dto.templateId);
    const scheduling = Boolean(dto.inspectorId && dto.scheduledFor) && !me.contractorOnly;
    const inspector = dto.inspectorId && !me.contractorOnly ? await this.inspectorMember(projectId, dto.inspectorId) : null;
    const last = await this.prisma.siteInspection.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const created = await this.prisma.siteInspection.create({
      data: {
        projectId,
        sequence,
        number: `INSP-${String(sequence).padStart(3, '0')}`,
        kind: dto.kind,
        title: dto.title.trim(),
        workType: dto.workType?.trim() || null,
        location: dto.location?.trim() || null,
        requestedById: userId,
        requestedFor: dto.requestedFor ? new Date(dto.requestedFor) : null,
        templateId: dto.templateId ?? null,
        checklist: items,
        inspectorId: inspector?.id ?? null,
        scheduledFor: scheduling ? new Date(dto.scheduledFor!) : null,
        status: scheduling ? 'SCHEDULED' : 'REQUESTED',
      },
    });
    if (scheduling && inspector?.userId && inspector.userId !== userId) {
      await this.notifyScheduled(projectId, created.id, inspector.userId, `${created.number} ${created.title}`, created.scheduledFor!);
    } else if (!scheduling) {
      for (const lead of (await this.leads(projectId)).filter((u) => u !== userId)) {
        await this.notifications.notify({ userId: lead, projectId, type: 'INSPECTION_REQUESTED', entityType: 'INSPECTION', entityId: created.id, message: `Inspection requested: ${created.number} ${created.title}` });
      }
    }
    return this.findOne(projectId, userId, created.id);
  }

  private notifyScheduled(projectId: string, id: string, userId: string, label: string, when: Date) {
    const day = when.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' });
    return this.notifications.notify({ userId, projectId, type: 'INSPECTION_SCHEDULED', entityType: 'INSPECTION', entityId: id, message: `You are inspecting ${label} on ${day}` });
  }

  async schedule(projectId: string, userId: string, id: string, inspectorId: string, scheduledFor: string) {
    const me = await this.who(projectId, userId);
    const i = await this.load(projectId, id);
    if (!this.shape(me, i).can.schedule) throw new BadRequestException('This inspection can no longer be scheduled');
    const inspector = await this.inspectorMember(projectId, inspectorId);
    const when = new Date(scheduledFor);
    await this.prisma.siteInspection.update({ where: { id }, data: { inspectorId, scheduledFor: when, status: 'SCHEDULED' } });
    if (inspector.userId && inspector.userId !== userId) await this.notifyScheduled(projectId, id, inspector.userId, `${i.number} ${i.title}`, when);
    if (i.requestedById !== userId && i.requestedById !== inspector.userId) {
      await this.notifications.notify({ userId: i.requestedById, projectId, type: 'INSPECTION_SCHEDULED', entityType: 'INSPECTION', entityId: id, message: `${i.number} ${i.title} is scheduled` });
    }
    return this.findOne(projectId, userId, id);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateInspectionDto) {
    const me = await this.who(projectId, userId);
    const i = await this.load(projectId, id);
    const can = this.shape(me, i).can;
    if (!can.record && !can.schedule) throw new BadRequestException('This inspection can no longer be changed');
    if (dto.checklist && !can.record) throw new ForbiddenException('Only the inspector records the checklist');
    const data: Prisma.SiteInspectionUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.workType !== undefined ? { workType: dto.workType?.trim() || null } : {}),
      ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary?.trim() || null } : {}),
    };
    if (dto.templateId !== undefined) {
      if ((i.checklist as Item[]).some((c) => c.result)) throw new BadRequestException('Results are already recorded against this checklist');
      data.template = dto.templateId ? { connect: { id: dto.templateId } } : { disconnect: true };
      data.checklist = await this.templateItems(dto.templateId);
    }
    if (dto.checklist) data.checklist = this.keepIssueLinks(i.checklist as Item[], clean(dto.checklist));
    await this.prisma.siteInspection.update({ where: { id }, data });
    return this.findOne(projectId, userId, id);
  }

  /** Issues already raised against an item stay linked when the inspector
   * re-saves the list. */
  private keepIssueLinks(before: Item[], after: Item[]) {
    return after.map((a, n) => (before[n]?.issueId && before[n].text === a.text ? { ...a, issueId: before[n].issueId } : a));
  }

  async complete(projectId: string, userId: string, id: string, dto: CompleteInspectionDto) {
    const me = await this.who(projectId, userId);
    const i = await this.load(projectId, id);
    if (!this.shape(me, i).can.record) throw new ForbiddenException('Only the inspector (or Setjeka) records the outcome');
    const checklist = dto.checklist ? this.keepIssueLinks(i.checklist as Item[], clean(dto.checklist)) : (i.checklist as Item[]);
    if (checklist.some((c) => !c.result)) throw new BadRequestException('Mark every checklist item pass, fail or not applicable');
    const failed = checklist.filter((c) => c.result === 'FAIL').length;
    if (failed && dto.outcome === 'CONFORMS') throw new BadRequestException(`${failed} item${failed === 1 ? '' : 's'} failed, so the work doesn't fully conform`);
    if (dto.outcome !== 'CONFORMS' && !dto.summary?.trim() && !checklist.some((c) => c.note)) throw new BadRequestException('Say what needs attention');
    await this.prisma.siteInspection.update({
      where: { id },
      data: { checklist, outcome: dto.outcome, summary: dto.summary?.trim() || i.summary, status: 'COMPLETED', completedAt: new Date(), completedById: userId },
    });
    const outcome = dto.outcome === 'CONFORMS' ? 'conforms' : dto.outcome === 'CONFORMS_WITH_COMMENTS' ? 'conforms, with comments' : 'does not conform';
    for (const target of new Set([i.requestedById, ...(await this.leads(projectId))].filter((u) => u !== userId))) {
      await this.notifications.notify({ userId: target, projectId, type: 'INSPECTION_COMPLETED', entityType: 'INSPECTION', entityId: id, message: `${i.number} ${i.title}: ${outcome}` });
    }
    return this.findOne(projectId, userId, id);
  }

  async cancel(projectId: string, userId: string, id: string) {
    const me = await this.who(projectId, userId);
    const i = await this.load(projectId, id);
    if (!this.shape(me, i).can.cancel) throw new BadRequestException('This inspection can no longer be cancelled');
    await this.prisma.siteInspection.update({ where: { id }, data: { status: 'CANCELLED' } });
    return this.findOne(projectId, userId, id);
  }

  /** A failed item (or any finding) becomes an issue for someone to fix. */
  async raiseIssue(projectId: string, userId: string, id: string, dto: InspectionIssueDto) {
    const me = await this.who(projectId, userId);
    const i = await this.load(projectId, id);
    if (!this.shape(me, i).can.raiseIssue) throw new ForbiddenException('Not allowed');
    if (dto.ownerId) {
      const owner = await this.prisma.projectMember.findFirst({ where: { id: dto.ownerId, projectId } });
      if (!owner) throw new BadRequestException('The owner must be on the project');
    }
    const items = (i.checklist as Item[]) ?? [];
    if (dto.itemIndex !== undefined && !items[dto.itemIndex]) throw new BadRequestException('Checklist item not found');
    const issue = await this.prisma.projectIssue.create({
      data: {
        projectId,
        inspectionId: id,
        title: dto.title.trim(),
        description: [dto.description?.trim(), `From inspection ${i.number} ${i.title}${dto.itemIndex !== undefined ? `, item: ${items[dto.itemIndex].text}` : ''}.`].filter(Boolean).join('\n\n'),
        ownerId: dto.ownerId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: 'HIGH',
      },
      include: { owner: { select: { userId: true } } },
    });
    if (dto.itemIndex !== undefined) {
      items[dto.itemIndex] = { ...items[dto.itemIndex], issueId: issue.id };
      await this.prisma.siteInspection.update({ where: { id }, data: { checklist: items } });
    }
    if (issue.owner?.userId && issue.owner.userId !== userId) {
      await this.notifications.notify({ userId: issue.owner.userId, projectId, type: 'ISSUE_ASSIGNED', entityType: 'ISSUE', entityId: issue.id, message: `Issue from inspection ${i.number}: ${issue.title}` });
    }
    return this.findOne(projectId, userId, id);
  }

  // ---- Checklist templates (company-wide, kept by Setjeka) ---------------

  templates(includeInactive: boolean) {
    return this.prisma.inspectionTemplate.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  private async assertInternal(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (u?.role !== 'ADMIN' && u?.accountType !== 'INTERNAL') throw new ForbiddenException('Only Setjeka keeps the checklists');
  }

  async createTemplate(userId: string, dto: TemplateDto) {
    await this.assertInternal(userId);
    const items = dto.items.map((x) => x.trim()).filter(Boolean);
    if (!items.length) throw new BadRequestException('Add at least one checklist item');
    return this.prisma.inspectionTemplate.create({ data: { name: dto.name.trim(), workType: dto.workType?.trim() || null, kind: dto.kind ?? null, items, active: dto.active ?? true, createdById: userId } });
  }

  async updateTemplate(userId: string, id: string, dto: TemplateDto) {
    await this.assertInternal(userId);
    const items = dto.items.map((x) => x.trim()).filter(Boolean);
    if (!items.length) throw new BadRequestException('Add at least one checklist item');
    const t = await this.prisma.inspectionTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Checklist not found');
    // Inspections copy the items when created, so editing a template never
    // rewrites an inspection already on record.
    return this.prisma.inspectionTemplate.update({ where: { id }, data: { name: dto.name.trim(), workType: dto.workType?.trim() || null, kind: dto.kind ?? null, items, active: dto.active ?? t.active } });
  }
}
