import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateActionItemDto, CreateMeetingDto, RecordAttendanceDto, UpdateMeetingDto } from './dto/meeting.dto.js';

const MEMBER = {
  select: { id: true, role: true, externalName: true, user: { select: { id: true, fullName: true } }, contractor: { select: { name: true } } },
} as const;

const MEETING_INCLUDE = {
  createdBy: { select: { fullName: true } },
  attendees: { include: { projectMember: MEMBER }, orderBy: { id: 'asc' } },
  actionItems: {
    select: { id: true, title: true, status: true, dueDate: true, priority: true, assignedTo: MEMBER },
    orderBy: { createdAt: 'asc' },
  },
} as const;

/** Project meetings (PROCSA every consultant's 1.2 "Attend project
 * initiation meetings"; register CLI "Client communications" — meeting
 * information and action items). Action items are ProjectTasks, so they
 * show up in the Tasks tab and in My Day like any other task. */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findAll(projectId: string) {
    return this.prisma.meeting.findMany({ where: { projectId }, include: MEETING_INCLUDE, orderBy: { scheduledAt: 'desc' } });
  }

  async findOne(projectId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, projectId }, include: MEETING_INCLUDE });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  private async assertMembers(projectId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.projectMember.count({ where: { projectId, id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException('Every attendee must be a member of this project');
    return unique;
  }

  async create(projectId: string, userId: string, dto: CreateMeetingDto) {
    const attendeeIds = await this.assertMembers(projectId, dto.attendeeIds ?? []);
    const meeting = await this.prisma.meeting.create({
      data: {
        projectId,
        title: dto.title.trim(),
        meetingType: dto.meetingType,
        scheduledAt: new Date(dto.scheduledAt),
        location: dto.location,
        agenda: dto.agenda,
        createdById: userId,
        attendees: { create: attendeeIds.map((projectMemberId) => ({ projectMemberId })) },
      },
    });
    await this.notifyInvitees(projectId, meeting.id, attendeeIds, userId);
    return this.findOne(projectId, meeting.id);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateMeetingDto) {
    const existing = await this.findOne(projectId, id);
    const { attendeeIds, ...fields } = dto;
    await this.prisma.meeting.update({
      where: { id },
      data: {
        ...fields,
        title: fields.title?.trim(),
        scheduledAt: fields.scheduledAt ? new Date(fields.scheduledAt) : undefined,
      },
    });
    if (attendeeIds) {
      const wanted = await this.assertMembers(projectId, attendeeIds);
      const current = existing.attendees.map((a) => a.projectMemberId);
      const added = wanted.filter((m) => !current.includes(m));
      await this.prisma.$transaction([
        this.prisma.meetingAttendee.deleteMany({ where: { meetingId: id, projectMemberId: { notIn: wanted } } }),
        this.prisma.meetingAttendee.createMany({ data: added.map((projectMemberId) => ({ meetingId: id, projectMemberId })) }),
      ]);
      await this.notifyInvitees(projectId, id, added, userId);
    }
    return this.findOne(projectId, id);
  }

  async recordAttendance(projectId: string, id: string, dto: RecordAttendanceDto) {
    const meeting = await this.findOne(projectId, id);
    const invited = new Set(meeting.attendees.map((a) => a.projectMemberId));
    for (const entry of dto.entries) {
      if (!invited.has(entry.projectMemberId)) throw new BadRequestException('Attendance can only be recorded for invited attendees');
    }
    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.meetingAttendee.update({
          where: { meetingId_projectMemberId: { meetingId: id, projectMemberId: e.projectMemberId } },
          data: { present: e.present ?? null },
        }),
      ),
    );
    return this.findOne(projectId, id);
  }

  /** Marks the meeting held and the minutes as issued to the attendees. */
  async issueMinutes(projectId: string, userId: string, id: string) {
    const meeting = await this.findOne(projectId, id);
    if (!meeting.minutes?.trim()) throw new BadRequestException('Write the minutes before issuing them');
    await this.prisma.meeting.update({ where: { id }, data: { status: 'HELD', minutesIssuedAt: new Date() } });
    for (const a of meeting.attendees) {
      if (a.projectMember.user && a.projectMember.user.id !== userId) {
        await this.notifications.notify({
          userId: a.projectMember.user.id,
          projectId,
          type: 'MEETING_SCHEDULED',
          entityType: 'MEETING',
          entityId: id,
          message: `Minutes issued: ${meeting.title}`,
        });
      }
    }
    return this.findOne(projectId, id);
  }

  async addActionItem(projectId: string, id: string, dto: CreateActionItemDto) {
    await this.findOne(projectId, id);
    if (dto.assignedToId) await this.assertMembers(projectId, [dto.assignedToId]);
    const task = await this.prisma.projectTask.create({
      data: {
        projectId,
        meetingId: id,
        title: dto.title.trim(),
        description: dto.description,
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
      },
      include: { assignedTo: { select: { userId: true } } },
    });
    await this.notifications.notify({
      userId: task.assignedTo?.userId,
      projectId,
      type: 'TASK_ASSIGNED',
      entityType: 'TASK',
      entityId: task.id,
      message: `Action item from a meeting: "${task.title}"`,
    });
    return this.findOne(projectId, id);
  }

  async remove(projectId: string, id: string) {
    await this.findOne(projectId, id);
    await this.prisma.meeting.delete({ where: { id } });
  }

  private async notifyInvitees(projectId: string, meetingId: string, memberIds: string[], userId: string) {
    if (!memberIds.length) return;
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { title: true, scheduledAt: true } });
    const members = await this.prisma.projectMember.findMany({ where: { id: { in: memberIds } }, select: { userId: true } });
    for (const m of members) {
      if (!m.userId || m.userId === userId) continue;
      await this.notifications.notify({
        userId: m.userId,
        projectId,
        type: 'MEETING_SCHEDULED',
        entityType: 'MEETING',
        entityId: meetingId,
        message: `You're invited: ${meeting?.title} on ${meeting?.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')}`,
      });
    }
  }
}
