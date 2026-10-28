import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CommercialService } from '../commercial/commercial.service.js';
import type { CommunicationKind, CommunicationStatus, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { responseDue } from '../signoff/dto/decision.dto.js';
import type { CommunicationQuery, CommunicationVariationDto, CreateCommunicationDto, UpdateCommunicationDto } from './dto/communication.dto.js';

export const KIND_LABEL: Record<CommunicationKind, string> = {
  CLIENT_REQUEST: 'Client request',
  SETJEKA_INSTRUCTION: 'Setjeka instruction',
  CONTRACT_INSTRUCTION: 'Contract instruction',
  CORRESPONDENCE: 'Letter',
};
const PREFIX: Record<CommunicationKind, string> = { CLIENT_REQUEST: 'CR', SETJEKA_INSTRUCTION: 'SI', CONTRACT_INSTRUCTION: 'CI', CORRESPONDENCE: 'LT' };

// The consultants PROCSA has drafting contract instructions (Architect 5.3,
// 5.11; the engineers clarify their own work the same way).
const DRAFTERS: ProjectMemberRole[] = ['ARCHITECT', 'ARCHITECT_ENGINEER', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER'];
const SETJEKA_LEADS: ProjectMemberRole[] = ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'];

const PERSON = { select: { id: true, fullName: true, email: true } } as const;
const INCLUDE = {
  author: PERSON,
  issuedBy: PERSON,
  recipients: { include: { user: PERSON }, orderBy: { user: { fullName: 'asc' } } },
  documents: { include: { document: { select: { id: true, name: true, drawingNumber: true } } } },
  parent: { select: { id: true, number: true, kind: true, subject: true, authorId: true } },
  children: { select: { id: true, number: true, kind: true, subject: true, status: true, issuedAt: true, authorId: true, recipients: { select: { userId: true, user: { select: { fullName: true } } } } } },
  variations: { select: { id: true, number: true, title: true, status: true } },
} satisfies Prisma.ProjectCommunicationInclude;

type Row = Prisma.ProjectCommunicationGetPayload<{ include: typeof INCLUDE }>;

/** Instructions and correspondence (the user's decision, 26 Oct 2026): the
 * client reaches the architect, and the architect the contractor, only
 * through Setjeka's PM and DM, and all of it is on the platform.
 *
 *   - The client writes requests to Setjeka; outside parties write letters
 *     to Setjeka. Neither picks recipients - they go to the DM and PM.
 *   - Setjeka instructs consultants and contractors.
 *   - The architect (or an engineer) drafts a contract instruction to the
 *     contractor; it waits until Setjeka issues it. */
@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly commercial: CommercialService,
  ) {}

  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } }),
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } }),
    ]);
    const roles = memberships.map((m) => m.role);
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    return { userId, internal, roles, client: !internal && roles.includes('CLIENT'), drafter: roles.some((r) => DRAFTERS.includes(r)) };
  }

  /** Setjeka's DM and PM on the project (with logins), who receive what
   * outside parties write. Falls back to any Setjeka member. */
  private async setjekaLeads(projectId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null }, user: { status: 'ACTIVE', accountType: 'INTERNAL' } },
      select: { role: true, userId: true },
    });
    const leads = members.filter((m) => SETJEKA_LEADS.includes(m.role));
    const ids = [...new Set((leads.length ? leads : members).map((m) => m.userId!))];
    if (!ids.length) throw new BadRequestException('This project has no Setjeka Project Manager or Development Manager to receive it yet');
    return ids;
  }

  /** Who a caller may address, by kind. Outside parties never choose. */
  async addressBook(projectId: string, userId: string) {
    const me = await this.who(projectId, userId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null }, user: { status: 'ACTIVE' } },
      select: { role: true, externalCompany: true, contractor: { select: { name: true } }, user: { select: { id: true, fullName: true, accountType: true } } },
    });
    const people = members
      .filter((m) => m.user!.id !== userId)
      .map((m) => ({ userId: m.user!.id, name: m.user!.fullName, role: m.role, company: m.contractor?.name ?? m.externalCompany ?? null, setjeka: m.user!.accountType === 'INTERNAL' }));
    const unique = [...new Map(people.map((p) => [`${p.userId}:${p.role}`, p])).values()];
    const leads = me.internal ? [] : await this.setjekaLeads(projectId).catch(() => []);
    return {
      internal: me.internal,
      client: me.client,
      drafter: me.drafter,
      setjeka: unique.filter((p) => leads.includes(p.userId) || (me.internal && p.setjeka)),
      people: me.internal ? unique.filter((p) => !p.setjeka) : [],
      contractors: unique.filter((p) => p.role === 'CONTRACTOR'),
      kinds: this.kindsFor(me),
    };
  }

  private kindsFor(me: Awaited<ReturnType<CommunicationsService['who']>>): CommunicationKind[] {
    if (me.internal) return ['SETJEKA_INSTRUCTION', 'CONTRACT_INSTRUCTION', 'CORRESPONDENCE'];
    if (me.client) return ['CLIENT_REQUEST', 'CORRESPONDENCE'];
    return me.drafter ? ['CONTRACT_INSTRUCTION', 'CORRESPONDENCE'] : ['CORRESPONDENCE'];
  }

  /** The recipients a communication goes to, under the routing rules. */
  private async route(projectId: string, me: Awaited<ReturnType<CommunicationsService['who']>>, kind: CommunicationKind, requested: string[] | undefined) {
    if (!this.kindsFor(me).includes(kind)) {
      throw new ForbiddenException(
        kind === 'CLIENT_REQUEST'
          ? 'Only the client raises a client request'
          : kind === 'SETJEKA_INSTRUCTION'
            ? 'Only Setjeka issues instructions; send a letter to Setjeka instead'
            : 'Only Setjeka and the consultants draft contract instructions',
      );
    }
    // Outside parties write to Setjeka only: the client never reaches the
    // architect, nor the architect the contractor, directly.
    if (!me.internal && kind !== 'CONTRACT_INSTRUCTION') return this.setjekaLeads(projectId);

    const ids = [...new Set((requested ?? []).filter((id) => id !== me.userId))];
    if (!ids.length) return [];
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { in: ids }, user: { status: 'ACTIVE' } },
      select: { userId: true, role: true },
    });
    const found = new Set(members.map((m) => m.userId));
    if (ids.some((id) => !found.has(id))) throw new BadRequestException('Every recipient must be on this project');
    if (kind === 'CONTRACT_INSTRUCTION') {
      const contractors = new Set(members.filter((m) => m.role === 'CONTRACTOR').map((m) => m.userId));
      if (ids.some((id) => !contractors.has(id))) throw new BadRequestException('A contract instruction goes to the contractor');
    }
    return ids;
  }

  private async assertDocuments(projectId: string, ids: string[] | undefined) {
    if (!ids?.length) return;
    const n = await this.prisma.projectDocument.count({ where: { deletedAt: null, projectId, id: { in: ids } } });
    if (n !== new Set(ids).size) throw new BadRequestException('Attach documents from this project only');
  }

  private async nextSequence(projectId: string, kind: CommunicationKind) {
    const last = await this.prisma.projectCommunication.findFirst({ where: { projectId, kind }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    return { sequence, number: `${PREFIX[kind]}-${String(sequence).padStart(3, '0')}` };
  }

  /** Can the caller see this one? Setjeka sees everything but other
   * people's drafts; everyone else sees what they wrote or received. */
  private canSee(me: Awaited<ReturnType<CommunicationsService['who']>>, c: Pick<Row, 'authorId' | 'status' | 'recipients'>) {
    if (c.authorId === me.userId) return true;
    if (c.status === 'DRAFT') return false;
    if (me.internal) return true;
    return c.status !== 'AWAITING_ISSUE' && c.recipients.some((r) => r.userId === me.userId);
  }

  private shape(me: Awaited<ReturnType<CommunicationsService['who']>>, c: Row) {
    const mine = c.recipients.find((r) => r.userId === me.userId) ?? null;
    return {
      ...c,
      kindLabel: KIND_LABEL[c.kind],
      // Outside parties see only that it was passed on, and to whom - not
      // the content of an instruction they're not party to.
      children: c.children
        .filter((x) => x.status !== 'DRAFT' && (me.internal || x.authorId === me.userId || x.recipients.some((r) => r.userId === me.userId) || c.authorId === me.userId))
        .map((x) => ({ id: x.id, number: x.number, kind: x.kind, kindLabel: KIND_LABEL[x.kind], status: x.status, issuedAt: x.issuedAt, to: x.recipients.map((r) => r.user.fullName), subject: me.internal || x.recipients.some((r) => r.userId === me.userId) ? x.subject : null })),
      variations: me.internal ? c.variations : [],
      myReceipt: mine ? { acknowledgedAt: mine.acknowledgedAt, respondedAt: mine.respondedAt } : null,
      can: {
        edit: (c.status === 'DRAFT' && c.authorId === me.userId) || (c.status === 'AWAITING_ISSUE' && (me.internal || c.authorId === me.userId)),
        send: c.status === 'DRAFT' && c.authorId === me.userId,
        issue: c.status === 'AWAITING_ISSUE' && me.internal,
        acknowledge: Boolean(mine) && !mine!.acknowledgedAt && ['ISSUED', 'RESPONDED'].includes(c.status),
        respond: Boolean(mine) && ['ISSUED', 'RESPONDED'].includes(c.status),
        close: me.internal && ['ISSUED', 'RESPONDED'].includes(c.status),
        cancel: (['DRAFT', 'AWAITING_ISSUE'].includes(c.status) && c.authorId === me.userId) || (me.internal && !['CLOSED', 'CANCELLED'].includes(c.status)),
        raiseVariation: me.internal && c.costImpact && !['DRAFT', 'CANCELLED'].includes(c.status),
        // What reached Setjeka - a client request or a letter - is what gets passed on.
        passOn: me.internal && (c.kind === 'CLIENT_REQUEST' || c.kind === 'CORRESPONDENCE') && ['ISSUED', 'RESPONDED'].includes(c.status),
      },
    };
  }

  async list(projectId: string, userId: string, q: CommunicationQuery) {
    const me = await this.who(projectId, userId);
    const where: Prisma.ProjectCommunicationWhereInput = {
      projectId,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.status ? { status: q.status } : {}),
      OR:
        me.internal && q.scope !== 'mine'
          ? [{ status: { not: 'DRAFT' } }, { authorId: userId }]
          : [{ authorId: userId }, { status: { notIn: ['DRAFT', 'AWAITING_ISSUE'] }, recipients: { some: { userId } } }],
    };
    const rows = await this.prisma.projectCommunication.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' } });
    const notes = await this.prisma.comment.groupBy({ by: ['entityId'], where: { entityType: 'COMMUNICATION', entityId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
    return rows.map((r) => ({ ...this.shape(me, r), noteCount: notes.find((n) => n.entityId === r.id)?._count._all ?? 0 }));
  }

  private async load(projectId: string, id: string) {
    const c = await this.prisma.projectCommunication.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!c) throw new NotFoundException('Not found');
    return c;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const me = await this.who(projectId, userId);
    const c = await this.load(projectId, id);
    if (!this.canSee(me, c)) throw new NotFoundException('Not found');
    return this.shape(me, c);
  }

  async create(projectId: string, userId: string, dto: CreateCommunicationDto) {
    const me = await this.who(projectId, userId);
    const recipients = await this.route(projectId, me, dto.kind, dto.recipientIds);
    await this.assertDocuments(projectId, dto.documentIds);
    if (dto.parentId) {
      const parent = await this.load(projectId, dto.parentId);
      if (!this.canSee(me, parent)) throw new BadRequestException('Not found');
    }
    const due = responseDue(dto.responseDueAt);
    const { sequence, number } = await this.nextSequence(projectId, dto.kind);
    const c = await this.prisma.projectCommunication.create({
      data: {
        projectId,
        kind: dto.kind,
        sequence,
        number,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
        authorId: userId,
        parentId: dto.parentId ?? null,
        responseDueAt: due,
        costImpact: dto.costImpact ?? false,
        timeImpact: dto.timeImpact ?? false,
        recipients: { create: recipients.map((id) => ({ userId: id })) },
        documents: { create: (dto.documentIds ?? []).map((documentId) => ({ documentId })) },
      },
    });
    if (dto.send !== false) return this.send(projectId, userId, c.id);
    return this.findOne(projectId, userId, c.id);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateCommunicationDto) {
    const me = await this.who(projectId, userId);
    const c = await this.load(projectId, id);
    if (!this.shape(me, c).can.edit) throw new BadRequestException('It can no longer be changed');
    const data: Prisma.ProjectCommunicationUpdateInput = {
      ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
      ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
      ...(dto.costImpact !== undefined ? { costImpact: dto.costImpact } : {}),
      ...(dto.timeImpact !== undefined ? { timeImpact: dto.timeImpact } : {}),
      ...(dto.responseDueAt !== undefined ? { responseDueAt: dto.responseDueAt ? responseDue(dto.responseDueAt) : null } : {}),
    };
    // A draft's author re-routes it under their own rules; Setjeka, issuing
    // someone else's draft, routes it under the drafter's kind.
    const recipients = dto.recipientIds !== undefined ? await this.route(projectId, c.authorId === userId ? me : { ...me, internal: true }, c.kind, dto.recipientIds) : null;
    if (dto.documentIds) await this.assertDocuments(projectId, dto.documentIds);
    await this.prisma.$transaction(async (tx) => {
      await tx.projectCommunication.update({ where: { id }, data });
      if (recipients) {
        await tx.communicationRecipient.deleteMany({ where: { communicationId: id } });
        await tx.communicationRecipient.createMany({ data: recipients.map((u) => ({ communicationId: id, userId: u })) });
      }
      if (dto.documentIds) {
        await tx.communicationDocument.deleteMany({ where: { communicationId: id } });
        await tx.communicationDocument.createMany({ data: dto.documentIds.map((documentId) => ({ communicationId: id, documentId })) });
      }
    });
    return this.findOne(projectId, userId, id);
  }

  /** Send a draft. A contract instruction drafted by a consultant waits for
   * Setjeka to issue it; everything else goes out now. */
  async send(projectId: string, userId: string, id: string) {
    const me = await this.who(projectId, userId);
    const c = await this.load(projectId, id);
    if (c.authorId !== userId || c.status !== 'DRAFT') throw new BadRequestException('Only a draft is sent, by its author');
    if (!c.recipients.length) throw new BadRequestException(c.kind === 'CONTRACT_INSTRUCTION' ? 'Choose the contractor it is for' : 'Choose who it is for');
    if (c.kind === 'CONTRACT_INSTRUCTION' && !me.internal) {
      await this.prisma.projectCommunication.update({ where: { id }, data: { status: 'AWAITING_ISSUE' } });
      for (const lead of await this.setjekaLeads(projectId)) {
        await this.notifications.notify({
          userId: lead,
          projectId,
          type: 'COMMUNICATION_AWAITING_ISSUE',
          entityType: 'COMMUNICATION',
          entityId: id,
          message: `${c.number} "${c.subject}" is ready for you to issue to the contractor`,
        });
      }
      return this.findOne(projectId, userId, id);
    }
    await this.issueNow(projectId, userId, c);
    return this.findOne(projectId, userId, id);
  }

  private async issueNow(projectId: string, issuerId: string, c: Row) {
    await this.prisma.projectCommunication.update({ where: { id: c.id }, data: { status: 'ISSUED', issuedById: issuerId, issuedAt: new Date() } });
    const from = c.kind === 'CLIENT_REQUEST' ? 'The client' : c.author.fullName;
    for (const r of c.recipients) {
      await this.notifications.notify({
        userId: r.userId,
        projectId,
        type: 'COMMUNICATION_RECEIVED',
        entityType: 'COMMUNICATION',
        entityId: c.id,
        message: `${KIND_LABEL[c.kind]} ${c.number} from ${from}: ${c.subject}`,
      });
    }
  }

  /** Setjeka issues a consultant's draft contract instruction. */
  async issue(projectId: string, userId: string, id: string) {
    const me = await this.who(projectId, userId);
    if (!me.internal) throw new ForbiddenException('Only Setjeka issues instructions');
    const c = await this.load(projectId, id);
    if (c.status !== 'AWAITING_ISSUE') throw new BadRequestException('Only an instruction waiting to be issued');
    if (!c.recipients.length) throw new BadRequestException('Choose the contractor it is for');
    await this.issueNow(projectId, userId, c);
    if (c.authorId !== userId) {
      await this.notifications.notify({
        userId: c.authorId,
        projectId,
        type: 'COMMUNICATION_ANSWERED',
        entityType: 'COMMUNICATION',
        entityId: id,
        message: `Setjeka issued your ${c.number} "${c.subject}"`,
      });
    }
    return this.findOne(projectId, userId, id);
  }

  private async receipt(projectId: string, userId: string, id: string) {
    const c = await this.load(projectId, id);
    const mine = c.recipients.find((r) => r.userId === userId);
    if (!mine || !['ISSUED', 'RESPONDED'].includes(c.status)) throw new NotFoundException('Not found');
    return { c, mine };
  }

  async acknowledge(projectId: string, userId: string, id: string) {
    await this.who(projectId, userId);
    const { mine } = await this.receipt(projectId, userId, id);
    if (!mine.acknowledgedAt) await this.prisma.communicationRecipient.update({ where: { id: mine.id }, data: { acknowledgedAt: new Date() } });
    return this.findOne(projectId, userId, id);
  }

  async respond(projectId: string, userId: string, id: string, response: string) {
    await this.who(projectId, userId);
    const { c, mine } = await this.receipt(projectId, userId, id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.communicationRecipient.update({ where: { id: mine.id }, data: { response: response.trim(), respondedAt: now, acknowledgedAt: mine.acknowledgedAt ?? now } }),
      this.prisma.projectCommunication.update({ where: { id }, data: { status: 'RESPONDED' } }),
    ]);
    const who = mine.user.fullName;
    for (const target of new Set([c.authorId, c.issuedById].filter((x): x is string => Boolean(x) && x !== userId))) {
      await this.notifications.notify({
        userId: target,
        projectId,
        type: 'COMMUNICATION_ANSWERED',
        entityType: 'COMMUNICATION',
        entityId: id,
        message: `${who} responded to ${c.number} "${c.subject}"`,
        collapse: true,
      });
    }
    return this.findOne(projectId, userId, id);
  }

  async setStatus(projectId: string, userId: string, id: string, to: Extract<CommunicationStatus, 'CLOSED' | 'CANCELLED'>) {
    const me = await this.who(projectId, userId);
    const c = await this.load(projectId, id);
    const can = this.shape(me, c).can;
    if (to === 'CLOSED' ? !can.close : !can.cancel) throw new BadRequestException(to === 'CLOSED' ? 'Only Setjeka closes it, once issued' : 'It can no longer be cancelled');
    await this.prisma.projectCommunication.update({ where: { id }, data: { status: to, ...(to === 'CLOSED' ? { closedAt: new Date() } : {}) } });
    return this.findOne(projectId, userId, id);
  }

  /** An instruction that costs money becomes a variation for the client to
   * decide (Meeting 3: the client alone approves variations). */
  async raiseVariation(projectId: string, userId: string, id: string, dto: CommunicationVariationDto) {
    const me = await this.who(projectId, userId);
    const c = await this.load(projectId, id);
    if (!this.shape(me, c).can.raiseVariation) throw new BadRequestException('Only Setjeka raises a variation, from an issued instruction with a cost impact');
    const v = await this.commercial.createVariation(projectId, userId, {
      title: dto.title?.trim() || c.subject,
      description: `From ${KIND_LABEL[c.kind].toLowerCase()} ${c.number}.\n\n${c.body}`,
      reason: c.kind === 'CLIENT_REQUEST' ? 'CLIENT_INSTRUCTION' : undefined,
      estimatedValue: dto.estimatedValue,
    });
    await this.prisma.variation.update({ where: { id: v.id }, data: { communicationId: id } });
    return this.findOne(projectId, userId, id);
  }
}
