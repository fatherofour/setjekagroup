import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { recordLink } from '../notifications/links.js';
import type { ActionStatusDto, CreateCommentDto, CreateOpportunityNoteDto } from './dto/create-comment.dto.js';
import type { CommentEntityType } from '../generated/prisma/enums.js';
import { describeRecords } from './note-context.js';

const PERSON = { select: { id: true, fullName: true } } as const;
const NOTE_INCLUDE = { author: PERSON, recipient: PERSON, completedBy: PERSON } as const;

type NoteInput = Pick<CreateCommentDto, 'body' | 'recipientId' | 'isAction' | 'dueDate' | 'priority'>;

const shorten = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Comments are notes (Meeting 3 §2.4, replacing "messaging"): a note on
 * any record, optionally addressed to a named person. As an action it joins
 * that person's action list with a due date and priority; a plain note
 * shows on their dashboard until they acknowledge it. Either way they are
 * alerted. Not a chat. */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertEntityInProject(entityType: CommentEntityType, entityId: string, projectId: string) {
    const lookup: Partial<Record<CommentEntityType, () => Promise<unknown>>> = {
      TASK: () => this.prisma.projectTask.findFirst({ where: { id: entityId, projectId } }),
      ISSUE: () => this.prisma.projectIssue.findFirst({ where: { id: entityId, projectId } }),
      SCHEDULE_ACTIVITY: () => this.prisma.scheduleActivity.findFirst({ where: { id: entityId, projectId } }),
      DOCUMENT_REVISION: () => this.prisma.documentRevision.findFirst({ where: { id: entityId, document: { projectId } } }),
      RISK: () => this.prisma.projectRisk.findFirst({ where: { id: entityId, projectId } }),
      RFI: () => this.prisma.rfi.findFirst({ where: { id: entityId, projectId } }),
      SUBMITTAL: () => this.prisma.submittal.findFirst({ where: { id: entityId, projectId } }),
      VARIATION: () => this.prisma.variation.findFirst({ where: { id: entityId, projectId } }),
      STAGE_TRANSITION: () => this.prisma.stageTransition.findFirst({ where: { id: entityId, projectId } }),
      STAGE_DELIVERABLE: () => this.prisma.stageDeliverable.findFirst({ where: { id: entityId, projectId } }),
      MEETING: () => this.prisma.meeting.findFirst({ where: { id: entityId, projectId } }),
      SITE_PHOTO: () => this.prisma.sitePhoto.findFirst({ where: { id: entityId, projectId } }),
      // The brief thread and general project notes are keyed by the project
      // id itself.
      PROJECT_BRIEF: async () => (entityId === projectId ? this.prisma.project.findUnique({ where: { id: projectId } }) : null),
      PROJECT: async () => (entityId === projectId ? this.prisma.project.findUnique({ where: { id: projectId } }) : null),
    };
    const find = lookup[entityType];
    if (!find) throw new BadRequestException(`Notes on a ${entityType} can't be added here`);
    if (!(await find())) throw new BadRequestException(`${entityType} not found in this project`);
  }

  /** Who a note on this project can be addressed to: members with a login,
   * plus (for Setjeka staff) any active internal colleague. */
  async people(projectId: string, callerId: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: callerId }, select: { accountType: true, role: true } });
    const internal = caller?.accountType === 'INTERNAL' || caller?.role === 'ADMIN';
    const [members, staff] = await Promise.all([
      this.prisma.projectMember.findMany({ where: { projectId, userId: { not: null }, user: { status: 'ACTIVE' } }, select: { role: true, user: PERSON } }),
      internal ? this.prisma.user.findMany({ where: { accountType: 'INTERNAL', status: 'ACTIVE' }, select: { id: true, fullName: true } }) : Promise.resolve([]),
    ]);
    const out = new Map<string, { id: string; fullName: string; role: string | null }>();
    for (const m of members) if (m.user) out.set(m.user.id, { ...m.user, role: m.role });
    for (const s of staff) if (!out.has(s.id)) out.set(s.id, { ...s, role: null });
    return [...out.values()].filter((p) => p.id !== callerId).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private async assertRecipient(projectId: string | null, recipientId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: recipientId }, select: { status: true, accountType: true, role: true } });
    if (!user || user.status !== 'ACTIVE') throw new BadRequestException('That person has no active login');
    if (!projectId) {
      if (user.accountType !== 'INTERNAL' && user.role !== 'ADMIN') throw new BadRequestException('Opportunity notes can only go to Setjeka staff');
      return;
    }
    const internal = user.accountType === 'INTERNAL' || user.role === 'ADMIN';
    if (!internal && !(await this.prisma.projectMember.findFirst({ where: { projectId, userId: recipientId } }))) {
      throw new BadRequestException('That person is not on this project');
    }
  }

  private noteData(dto: NoteInput) {
    const isAction = Boolean(dto.isAction && dto.recipientId);
    if (dto.isAction && !dto.recipientId) throw new BadRequestException('Choose who the action is for');
    return {
      body: dto.body.trim(),
      recipientId: dto.recipientId,
      isAction,
      dueDate: isAction && dto.dueDate ? new Date(dto.dueDate) : null,
      priority: isAction ? (dto.priority ?? 'MEDIUM') : null,
      actionStatus: isAction ? ('OPEN' as const) : null,
    };
  }

  private async alertRecipient(note: { id: string; recipientId: string | null; authorId: string; isAction: boolean; body: string; entityType: CommentEntityType; entityId: string; projectId: string | null; opportunityId: string | null; dueDate: Date | null }) {
    if (!note.recipientId || note.recipientId === note.authorId) return;
    const [author, context] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: note.authorId }, select: { fullName: true } }),
      describeRecords(this.prisma, [note]),
    ]);
    const where = context.get(`${note.entityType}:${note.entityId}`);
    await this.notifications.notify({
      userId: note.recipientId,
      projectId: note.projectId,
      opportunityId: note.opportunityId,
      type: note.isAction ? 'ACTION_ASSIGNED' : 'NOTE_FOR_YOU',
      entityType: note.entityType,
      entityId: note.entityId,
      message: `${author?.fullName ?? 'Someone'} ${note.isAction ? 'gave you an action' : 'left you a note'}${where ? ` on ${where}` : ''}: "${shorten(note.body)}"${note.isAction && note.dueDate ? ` (due ${note.dueDate.toLocaleDateString('en-ZA')})` : ''}`,
    });
  }

  async findAll(projectId: string, ownerId: string, entityType: CommentEntityType, entityId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    return this.prisma.comment.findMany({ where: { projectId, entityType, entityId }, include: NOTE_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async create(projectId: string, ownerId: string, authorId: string, dto: CreateCommentDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    await this.assertEntityInProject(dto.entityType, dto.entityId, projectId);
    if (dto.recipientId) await this.assertRecipient(projectId, dto.recipientId);

    const comment = await this.prisma.comment.create({
      data: { projectId, entityType: dto.entityType, entityId: dto.entityId, authorId, ...this.noteData(dto) },
      include: NOTE_INCLUDE,
    });
    await this.alertRecipient(comment);
    await this.notifyMentions(projectId, dto.body, dto.entityType, dto.entityId, authorId, comment.recipientId);
    return comment;
  }

  // Plain substring match of "@Full Name" against the project's members —
  // simpler and more predictable than a name-fragment regex, and avoids
  // false positives from a bare "@" with no real mention.
  private async notifyMentions(projectId: string, body: string, entityType: CommentEntityType, entityId: string, authorId: string, recipientId: string | null) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: null } },
      select: { userId: true, user: { select: { id: true, fullName: true } } },
    });
    for (const member of members) {
      if (!member.user || member.user.id === authorId || member.user.id === recipientId) continue;
      if (body.includes(`@${member.user.fullName}`)) {
        await this.notifications.notify({
          userId: member.user.id,
          projectId,
          type: 'MENTIONED',
          entityType,
          entityId,
          message: `You were mentioned in a note`,
        });
      }
    }
  }

  async remove(projectId: string, ownerId: string, id: string, requesterId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const comment = await this.prisma.comment.findFirst({ where: { id, projectId } });
    if (!comment) throw new NotFoundException('Note not found');
    if (comment.authorId !== requesterId) throw new ForbiddenException('You can only delete your own notes');
    await this.prisma.comment.delete({ where: { id } });
  }

  // ---- Actions ----------------------------------------------------------------

  /** Mark an action done (or reopen it). The person it's for, the author, or
   * Setjeka staff can do this; the author is told when it's done. */
  async setActionStatus(noteId: string, userId: string, dto: ActionStatusDto, scope: { projectId?: string; opportunityId?: string }) {
    const note = await this.prisma.comment.findFirst({ where: { id: noteId, ...scope } });
    if (!note || !note.isAction) throw new NotFoundException('Action not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, role: true } });
    const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
    if (note.recipientId !== userId && note.authorId !== userId && !internal) throw new ForbiddenException('Only the person the action is for, or its author, can change it');
    const done = dto.status === 'DONE';
    const updated = await this.prisma.comment.update({
      where: { id: noteId },
      data: { actionStatus: dto.status, completedAt: done ? new Date() : null, completedById: done ? userId : null },
      include: NOTE_INCLUDE,
    });
    if (done && note.authorId !== userId) {
      await this.notifications.notify({
        userId: note.authorId,
        projectId: note.projectId,
        opportunityId: note.opportunityId,
        type: 'ACTION_COMPLETED',
        entityType: note.entityType,
        entityId: note.entityId,
        message: `${updated.completedBy?.fullName ?? 'Someone'} completed your action: "${shorten(note.body)}"`,
      });
    }
    return updated;
  }

  /** The person a plain note is for clears it from their dashboard. */
  async acknowledge(noteId: string, userId: string) {
    const note = await this.prisma.comment.findFirst({ where: { id: noteId, recipientId: userId } });
    if (!note) throw new NotFoundException('Note not found');
    return this.prisma.comment.update({ where: { id: noteId }, data: { acknowledgedAt: new Date() } });
  }

  // ---- Opportunity notes (Stage 0, internal) ----------------------------------

  async opportunityNotes(opportunityId: string) {
    if (!(await this.prisma.opportunity.findUnique({ where: { id: opportunityId } }))) throw new NotFoundException('Opportunity not found');
    return this.prisma.comment.findMany({ where: { opportunityId }, include: NOTE_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async addOpportunityNote(opportunityId: string, authorId: string, dto: CreateOpportunityNoteDto) {
    if (!(await this.prisma.opportunity.findUnique({ where: { id: opportunityId } }))) throw new NotFoundException('Opportunity not found');
    if (dto.recipientId) await this.assertRecipient(null, dto.recipientId);
    const note = await this.prisma.comment.create({
      data: { opportunityId, entityType: 'OPPORTUNITY', entityId: opportunityId, authorId, ...this.noteData(dto) },
      include: NOTE_INCLUDE,
    });
    await this.alertRecipient(note);
    return note;
  }

  opportunityPeople(callerId: string) {
    return this.prisma.user.findMany({
      where: { accountType: 'INTERNAL', status: 'ACTIVE', id: { not: callerId } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  // ---- My actions & notes; the project action register --------------------------

  private async decorate<T extends { entityType: CommentEntityType; entityId: string; projectId: string | null; opportunityId: string | null }>(notes: T[]) {
    const [labels, projects] = await Promise.all([
      describeRecords(this.prisma, notes),
      this.prisma.project.findMany({ where: { id: { in: [...new Set(notes.map((n) => n.projectId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } }),
    ]);
    return notes.map((n) => ({
      ...n,
      context: labels.get(`${n.entityType}:${n.entityId}`) ?? null,
      projectName: projects.find((p) => p.id === n.projectId)?.name ?? null,
      link: recordLink(n.entityType, n),
    }));
  }

  /** "My Day": open actions addressed to me (and ones finished in the last
   * fortnight), notes for me not yet acknowledged, and project tasks assigned
   * to me - including meeting action items. */
  async mine(userId: string) {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const [actions, notes, memberships] = await Promise.all([
      this.prisma.comment.findMany({
        where: { recipientId: userId, isAction: true, OR: [{ actionStatus: 'OPEN' }, { completedAt: { gte: since } }] },
        include: NOTE_INCLUDE,
        orderBy: [{ actionStatus: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
      this.prisma.comment.findMany({ where: { recipientId: userId, isAction: false, acknowledgedAt: null }, include: NOTE_INCLUDE, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.projectMember.findMany({ where: { userId }, select: { id: true } }),
    ]);
    const tasks = await this.prisma.projectTask.findMany({
      where: { assignedToId: { in: memberships.map((m) => m.id) }, status: { not: 'DONE' } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, projectId: true, project: { select: { name: true } }, meeting: { select: { id: true, title: true } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
    });
    return {
      actions: await this.decorate(actions),
      notes: await this.decorate(notes),
      tasks: tasks.map((t) => ({ ...t, link: recordLink('TASK', t) })),
    };
  }

  /** Register COL "Action register": every action on a project in one place
   * - note actions on any record, and meeting action items. */
  async projectActions(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const [noteActions, meetingTasks] = await Promise.all([
      this.prisma.comment.findMany({ where: { projectId, isAction: true }, include: NOTE_INCLUDE, orderBy: [{ actionStatus: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }] }),
      this.prisma.projectTask.findMany({
        where: { projectId, meetingId: { not: null } },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          updatedAt: true,
          assignedTo: { select: { externalName: true, user: { select: { fullName: true } } } },
          meeting: { select: { id: true, title: true, scheduledAt: true } },
        },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
      }),
    ]);
    const notes = await this.decorate(noteActions);
    const rows = [
      ...notes.map((n) => ({
        kind: 'NOTE' as const,
        id: n.id,
        title: n.body,
        owner: n.recipient?.fullName ?? null,
        raisedBy: n.author.fullName,
        dueDate: n.dueDate,
        priority: n.priority,
        open: n.actionStatus === 'OPEN',
        source: n.context,
        link: n.link,
        createdAt: n.createdAt,
      })),
      ...meetingTasks.map((t) => ({
        kind: 'MEETING' as const,
        id: t.id,
        title: t.title,
        owner: t.assignedTo?.user?.fullName ?? t.assignedTo?.externalName ?? null,
        raisedBy: null,
        dueDate: t.dueDate,
        priority: t.priority,
        open: t.status !== 'DONE',
        source: `Meeting · ${t.meeting!.title}`,
        link: recordLink('TASK', { projectId }),
        createdAt: t.meeting!.scheduledAt,
      })),
    ];
    const now = Date.now();
    return {
      rows: rows.sort((a, b) => Number(b.open) - Number(a.open) || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)),
      summary: {
        open: rows.filter((r) => r.open).length,
        overdue: rows.filter((r) => r.open && r.dueDate && r.dueDate.getTime() < now).length,
        done: rows.filter((r) => !r.open).length,
      },
    };
  }
}
