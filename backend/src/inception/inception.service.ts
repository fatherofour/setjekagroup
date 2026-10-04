import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScheduleService } from '../schedule/schedule.service.js';
import { endDateFromStart } from '../schedule/schedule-cpm.util.js';
import { DeliverablesService } from './deliverables.service.js';
import { InceptionStateService } from './inception-state.service.js';
import { INITIATION_PROGRAMME_TEMPLATE, PROCSA_STAGE1_ROLES } from './procsa.js';
import { MEMBER_SELECT } from './registers.js';
import { addConsultantMembers } from './team.js';
import type { CreateAdviceDto, UpdateAppointmentTermsDto, UpdateBriefDto, UpdateProcurementPolicyDto } from './dto/inception.dto.js';

const dateOrNull = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

@Injectable()
export class InceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliverables: DeliverablesService,
    private readonly state: InceptionStateService,
    private readonly schedule: ScheduleService,
  ) {}

  // ---- Brief (DM 1.1, PM 1.1, consultants 1.1) ----

  async getBrief(projectId: string) {
    return (await this.prisma.projectBrief.findUnique({ where: { projectId } })) ?? { projectId };
  }

  async updateBrief(projectId: string, userId: string, dto: UpdateBriefDto) {
    const data = { ...dto, targetCompletion: dateOrNull(dto.targetCompletion) };
    await this.prisma.projectBrief.upsert({ where: { projectId }, update: data, create: { ...data, projectId } });
    await this.deliverables.touch(projectId, 'BRIEF', userId);
    return this.getBrief(projectId);
  }

  // ---- Procurement policy (DM 1.5, PM 1.2) ----

  async getPolicy(projectId: string) {
    const [policy, project] = await Promise.all([
      this.prisma.procurementPolicy.findUnique({ where: { projectId } }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { contractForm: true } }),
    ]);
    return { ...(policy ?? { projectId, minimumQuotes: 3, priceWeight: 60, ratingWeight: 40 }), contractForm: project?.contractForm ?? null };
  }

  async updatePolicy(projectId: string, userId: string, dto: UpdateProcurementPolicyDto) {
    const { contractForm, ...policy } = dto;
    const priceWeight = policy.priceWeight;
    const ratingWeight = policy.ratingWeight;
    if (priceWeight !== undefined && ratingWeight !== undefined && priceWeight + ratingWeight === 0) {
      throw new BadRequestException('Price and track-record weights cannot both be zero');
    }
    await this.prisma.$transaction([
      this.prisma.procurementPolicy.upsert({ where: { projectId }, update: policy, create: { ...policy, projectId } }),
      ...(contractForm !== undefined ? [this.prisma.project.update({ where: { id: projectId }, data: { contractForm } })] : []),
    ]);
    await this.deliverables.touch(projectId, 'PROCUREMENT_POLICY', userId);
    return this.getPolicy(projectId);
  }

  // ---- Consultant advice (the "Advise on ..." items) ----

  listAdvice(projectId: string) {
    return this.prisma.consultantAdvice.findMany({
      where: { projectId },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addAdvice(projectId: string, userId: string, dto: CreateAdviceDto) {
    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId }, select: { role: true } });
    return this.prisma.consultantAdvice.create({
      data: { projectId, topic: dto.topic, body: dto.body.trim(), authorId: userId, authorRole: member?.role ?? null },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async removeAdvice(projectId: string, userId: string, id: string) {
    const advice = await this.prisma.consultantAdvice.findFirst({ where: { id, projectId } });
    if (!advice) throw new NotFoundException('Advice not found');
    if (advice.authorId !== userId) throw new BadRequestException('You can only remove your own advice');
    await this.prisma.consultantAdvice.delete({ where: { id } });
  }

  // ---- Desktop viability (DM 1.3) ----

  async preferScenario(projectId: string, userId: string, id: string) {
    const found = await this.prisma.viabilityScenario.count({ where: { id, projectId } });
    if (!found) throw new NotFoundException('Scenario not found');
    await this.prisma.$transaction([
      this.prisma.viabilityScenario.updateMany({ where: { projectId, NOT: { id } }, data: { isPreferred: false } }),
      this.prisma.viabilityScenario.update({ where: { id }, data: { isPreferred: true } }),
    ]);
    await this.deliverables.touch(projectId, 'DESKTOP_VIABILITY', userId);
  }

  // ---- PROCSA responsibility tracker (all roles) ----

  async responsibilities(projectId: string) {
    const [state, members] = await Promise.all([
      this.state.load(projectId),
      this.prisma.projectMember.findMany({ where: { projectId }, ...MEMBER_SELECT }),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    return this.state.responsibilities(state).map((role) => ({
      ...role,
      members: role.members.map((id) => memberById.get(id)!).filter(Boolean),
    }));
  }

  async setResponsibility(projectId: string, userId: string, roleKey: string, code: string, done: boolean, note?: string) {
    const role = PROCSA_STAGE1_ROLES.find((r) => r.key === roleKey);
    if (!role || !role.items.some((i) => i.code === code)) throw new NotFoundException('Unknown PROCSA responsibility');
    const where = { projectId_stage_roleKey_code: { projectId, stage: 'INCEPTION' as const, roleKey, code } };
    if (done) {
      await this.prisma.responsibilityCheck.upsert({
        where,
        update: { doneById: userId, note: note?.trim() || null, doneAt: new Date() },
        create: { projectId, stage: 'INCEPTION', roleKey, code, doneById: userId, note: note?.trim() || null },
      });
    } else {
      await this.prisma.responsibilityCheck.deleteMany({ where: { projectId, stage: 'INCEPTION', roleKey, code } });
    }
    return this.responsibilities(projectId);
  }

  // ---- Initiation programme (PM 1.8) ----

  /** Adds the Stage 1 template to the project's schedule as a finish-to-
   * start chain; the existing CPM recalculation then dates each activity. */
  async generateProgramme(projectId: string, userId: string, startDate?: string) {
    const existing = await this.prisma.scheduleActivity.count({ where: { projectId, name: { startsWith: 'Stage 1 — ' } } });
    if (existing) throw new BadRequestException('The Stage 1 initiation programme is already on the schedule');

    const start = startDate ? new Date(startDate) : new Date();
    start.setUTCHours(0, 0, 0, 0);
    const maxSort = await this.prisma.scheduleActivity.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    let sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

    const ids: string[] = [];
    for (const item of INITIATION_PROGRAMME_TEMPLATE) {
      const durationDays = item.milestone ? 0 : item.durationDays;
      const activity = await this.prisma.scheduleActivity.create({
        data: {
          projectId,
          name: `Stage 1 — ${item.name}`,
          activityType: item.milestone ? 'MILESTONE' : 'TASK',
          startDate: start,
          endDate: endDateFromStart(start, durationDays),
          durationDays,
          sortOrder: sortOrder++,
        },
      });
      ids.push(activity.id);
    }
    await this.prisma.scheduleDependency.createMany({
      data: ids.slice(1).map((successorId, i) => ({ projectId, predecessorId: ids[i], successorId, type: 'FS' as const })),
    });
    await this.schedule.recalculate(projectId);
    await this.deliverables.touch(projectId, 'INITIATION_PROGRAMME', userId);
    return { created: ids.length };
  }

  // ---- "My Stage 1": a consultant's own PROCSA items and appointment ----

  private async callerContext(projectId: string, userId: string) {
    const [members, user] = await Promise.all([
      this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true, contractorId: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { contractorId: true } }),
    ]);
    const contractorIds = [...new Set([...members.map((m) => m.contractorId), user?.contractorId].filter((c): c is string => Boolean(c)))];
    return { members, contractorIds };
  }

  /** The caller's PROCSA role(s) on this project, each Stage 1 item with
   * what would evidence it, their own appointment(s) and the meetings
   * they're invited to — everything a consultant needs for Stage 1 in one
   * place. */
  async myRole(projectId: string, userId: string) {
    const { members, contractorIds } = await this.callerContext(projectId, userId);
    const state = await this.state.load(projectId);
    const roles = this.state
      .responsibilities(state)
      .filter((r) => PROCSA_STAGE1_ROLES.find((p) => p.key === r.key)!.memberRoles.some((role) => members.some((m) => m.role === role)));
    const memberIds = members.map((m) => m.id);
    const [appointments, meetings] = await Promise.all([
      contractorIds.length
        ? this.prisma.organisationProjectAppointment.findMany({
            where: { projectId, contractorId: { in: contractorIds } },
            select: {
              id: true,
              role: true,
              appointmentType: true,
              scopeOfWork: true,
              rolesAndResponsibilities: true,
              feeBasis: true,
              feePercentage: true,
              contractValue: true,
              currency: true,
              agreementForm: true,
              agreementStatus: true,
              agreementSignedAt: true,
              contractor: { select: { name: true } },
            },
          })
        : [],
      memberIds.length
        ? this.prisma.meeting.findMany({
            where: { projectId, attendees: { some: { projectMemberId: { in: memberIds } } } },
            select: {
              id: true,
              title: true,
              meetingType: true,
              scheduledAt: true,
              status: true,
              attendees: { where: { projectMemberId: { in: memberIds } }, select: { present: true } },
            },
            orderBy: { scheduledAt: 'asc' },
          })
        : [],
    ]);
    return { members, roles, appointments, meetings };
  }

  private async ownAppointment(projectId: string, userId: string, appointmentId: string) {
    const { contractorIds } = await this.callerContext(projectId, userId);
    const appointment = await this.prisma.organisationProjectAppointment.findFirst({ where: { id: appointmentId, projectId } });
    if (!appointment || !contractorIds.includes(appointment.contractorId)) throw new NotFoundException('That is not your firm’s appointment on this project');
    return appointment;
  }

  /** Consultants 1.5 "Define the consultant's scope of work and services":
   * the firm proposes its own scope and responsibilities until the
   * agreement is signed. Fees and agreement status stay with Setjeka. */
  async updateMyAppointment(projectId: string, userId: string, appointmentId: string, dto: { scopeOfWork?: string | null; rolesAndResponsibilities?: string | null }) {
    const appointment = await this.ownAppointment(projectId, userId, appointmentId);
    if (appointment.agreementStatus === 'SIGNED') throw new BadRequestException('The agreement is signed; ask the Project Manager to change the scope');
    await this.prisma.organisationProjectAppointment.update({
      where: { id: appointmentId },
      data: { scopeOfWork: dto.scopeOfWork, rolesAndResponsibilities: dto.rolesAndResponsibilities },
    });
    await this.deliverables.touch(projectId, 'PROFESSIONAL_TEAM', userId);
    return this.myRole(projectId, userId);
  }

  /** Consultants 1.6 "Conclude the terms of the agreement with the client":
   * once Setjeka issues the agreement, the firm accepts and signs it. */
  async signMyAgreement(projectId: string, userId: string, appointmentId: string) {
    const appointment = await this.ownAppointment(projectId, userId, appointmentId);
    if (appointment.agreementStatus !== 'ISSUED') {
      throw new BadRequestException(appointment.agreementStatus === 'SIGNED' ? 'Already signed' : 'The agreement hasn’t been issued for signature yet');
    }
    await this.prisma.organisationProjectAppointment.update({ where: { id: appointmentId }, data: { agreementStatus: 'SIGNED', agreementSignedAt: new Date() } });
    return this.myRole(projectId, userId);
  }

  // ---- Professional team (DM 1.4, PM 1.3/1.5/1.6, consultants 1.5/1.6) ----

  /** External callers (consultants) see who is appointed and their scopes,
   * but fee terms only for their own firm. */
  async professionalTeam(projectId: string, userId: string) {
    const team = await this.fullProfessionalTeam(projectId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return team;
    const { contractorIds } = await this.callerContext(projectId, userId);
    return {
      ...team,
      appointments: team.appointments.map((a) =>
        contractorIds.includes(a.contractorId)
          ? a
          : { ...a, contractValue: null, feePercentage: null, feeBasis: null, rankAtAward: null, scoreAtAward: null, awardJustification: null },
      ),
    };
  }

  private async fullProfessionalTeam(projectId: string) {
    const [services, appointments] = await Promise.all([
      this.prisma.requiredService.findMany({ where: { projectId }, include: { recommendedBy: MEMBER_SELECT }, orderBy: { createdAt: 'asc' } }),
      this.prisma.organisationProjectAppointment.findMany({
        where: { projectId },
        include: { contractor: { select: { id: true, name: true, disciplines: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const firm = appointments.filter((a) => ['APPOINTED', 'ACTIVE', 'COMPLETED'].includes(a.appointmentStatus));
    const indicative = appointments.filter((a) => a.appointmentStatus === 'PROPOSED');
    const matches = (a: (typeof appointments)[number], key: string) =>
      (a.appointmentType ?? '').trim().toLowerCase() === key || a.contractor.disciplines.some((d) => d.trim().toLowerCase() === key);
    return {
      services: services.map((s) => {
        const key = s.discipline.trim().toLowerCase();
        const covering = firm.find((a) => matches(a, key));
        const proposed = covering ? null : indicative.find((a) => matches(a, key));
        return {
          ...s,
          coverage: s.notRequired ? 'NOT_REQUIRED' : covering ? 'APPOINTED' : proposed ? 'INDICATIVE' : 'OPEN',
          appointedFirm: (covering ?? proposed)?.contractor.name ?? null,
        };
      }),
      appointments,
    };
  }

  async updateAppointmentTerms(projectId: string, userId: string, appointmentId: string, dto: UpdateAppointmentTermsDto) {
    const appointment = await this.prisma.organisationProjectAppointment.findFirst({ where: { id: appointmentId, projectId } });
    if (!appointment) throw new NotFoundException('Appointment not found on this project');
    const agreementSignedAt =
      dto.agreementStatus === 'SIGNED' && dto.agreementSignedAt === undefined && !appointment.agreementSignedAt
        ? new Date()
        : dateOrNull(dto.agreementSignedAt);
    await this.prisma.organisationProjectAppointment.update({
      where: { id: appointmentId },
      data: { ...dto, agreementSignedAt },
    });
    await this.deliverables.touch(projectId, 'PROFESSIONAL_TEAM', userId);
    return this.professionalTeam(projectId, userId);
  }

  /** An indicative Stage 0 consultant pick (PROPOSED) becomes a firm
   * appointment, and the firm joins the project team (Meeting 3: the Stage 0
   * selection is not binding until Setjeka confirms it). */
  async confirmIndicative(projectId: string, userId: string, appointmentId: string) {
    const a = await this.prisma.organisationProjectAppointment.findFirst({ where: { id: appointmentId, projectId } });
    if (!a) throw new NotFoundException('Appointment not found on this project');
    if (a.appointmentStatus !== 'PROPOSED') throw new BadRequestException('Only an indicative selection can be confirmed');
    await this.prisma.$transaction(async (tx) => {
      await tx.organisationProjectAppointment.update({ where: { id: appointmentId }, data: { appointmentStatus: 'APPOINTED', appointmentDate: new Date() } });
      await addConsultantMembers(tx, projectId, a.contractorId, a.role);
    });
    await this.deliverables.touch(projectId, 'PROFESSIONAL_TEAM', userId);
    return this.professionalTeam(projectId, userId);
  }

  /** Let an indicative pick go, so the discipline can be appointed from a
   * project RFQ instead. */
  async releaseIndicative(projectId: string, userId: string, appointmentId: string) {
    const a = await this.prisma.organisationProjectAppointment.findFirst({ where: { id: appointmentId, projectId } });
    if (!a) throw new NotFoundException('Appointment not found on this project');
    if (a.appointmentStatus !== 'PROPOSED') throw new BadRequestException('Only an indicative selection can be released');
    await this.prisma.organisationProjectAppointment.update({ where: { id: appointmentId }, data: { appointmentStatus: 'TERMINATED' } });
    await this.deliverables.touch(projectId, 'PROFESSIONAL_TEAM', userId);
    return this.professionalTeam(projectId, userId);
  }
}
