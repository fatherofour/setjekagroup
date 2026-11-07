import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { SignoffService, type RequestMeta } from '../signoff/signoff.service.js';
import { OUTCOME_LABEL, isApproval, resolveOutcome, responseDue, type DecisionDto } from '../signoff/dto/decision.dto.js';
import { STAGE_LABEL } from '../reports/report-data.js';

const longDate = (d: Date) => d.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric' });

/** How a project ends (the user's decision, 7 Nov 2026). Completed: Setjeka
 * sends the client a certificate of completion to sign, the signed copy is
 * filed with the project's documents, and Setjeka marks the project
 * completed. Abandoned: Setjeka gives the reason, and the project is
 * archived with its documents kept. Either way the client is told. */
@Injectable()
export class CloseoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
    private readonly signoff: SignoffService,
  ) {}

  private async setjekaOnly(projectId: string, userId: string) {
    const project = await this.projects.findOneForOwner(projectId, userId);
    if (!(await this.projects.isSetjeka(userId))) throw new ForbiddenException('Only Setjeka can do this');
    if (project.closureType) throw new BadRequestException(`This project has already been ${project.closureType === 'COMPLETED' ? 'completed' : 'abandoned'}`);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
    return { project, me };
  }

  async state(projectId: string, userId: string) {
    const project = await this.projects.findOneForOwner(projectId, userId);
    const completions = await this.prisma.projectCompletion.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
    const records = completions.length
      ? await this.prisma.approvalRecord.findMany({ where: { projectId, subject: 'PROJECT_COMPLETION', subjectId: { in: completions.map((c) => c.id) } }, select: { id: true, subjectId: true } })
      : [];
    const recordOf = new Map(records.map((r) => [r.subjectId, r.id]));
    return {
      stage: project.stage,
      status: project.status,
      closureType: project.closureType,
      closureReason: project.closureReason,
      closedAt: project.closedAt,
      closedByName: project.closedByName,
      completions: completions.map((c) => ({ ...c, approvalRecordId: recordOf.get(c.id) ?? null })),
    };
  }

  /** Sends the client the certificate of completion to sign. */
  async issueCertificate(projectId: string, userId: string, dto: { completionDate: string; message?: string; responseDueAt?: string }) {
    const { project, me } = await this.setjekaOnly(projectId, userId);
    if (project.stage !== 'CLOSEOUT') throw new BadRequestException(`The certificate of completion is sent at ${STAGE_LABEL.CLOSEOUT}; this project is at ${STAGE_LABEL[project.stage]}`);
    if (await this.prisma.projectCompletion.findFirst({ where: { projectId, status: 'PENDING' } })) throw new BadRequestException('A certificate of completion is already with the client');
    const completionDate = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dto.completionDate) ? `${dto.completionDate}T12:00:00+02:00` : dto.completionDate);
    if (Number.isNaN(completionDate.getTime())) throw new BadRequestException('Give the date the works were completed');
    const clients = await this.notifications.clientsOf(projectId);
    if (!clients.length) throw new BadRequestException('The project has no client with a platform login to sign the certificate. Add the client to the project team first.');
    const dueAt = responseDue(dto.responseDueAt);
    const completion = await this.prisma.projectCompletion.create({
      data: { projectId, completionDate, message: dto.message?.trim() || null, responseDueAt: dueAt, issuedById: userId, issuedByName: me.fullName },
    });
    await this.audit.log({ userId, action: 'CREATE', module: 'STAGE_GATE', entityType: 'PROJECT_COMPLETION', entityId: completion.id, projectId });
    await this.notifications.notifyByEmailToo(
      clients,
      {
        projectId,
        type: 'COMPLETION_CERTIFICATE_ISSUED',
        entityType: 'PROJECT',
        entityId: completion.id,
        message: `${project.name}: please sign the certificate of completion`,
        link: `/projects/${projectId}?tab=overview`,
      },
      {
        subject: `${project.name}: certificate of completion for your signature`,
        paragraphs: [
          `The works on ${project.name} were completed on ${longDate(completionDate)}. Setjeka asks you to sign the certificate of completion.${dueAt ? ` Please respond by ${longDate(dueAt)}.` : ''}`,
          ...(completion.message ? [completion.message] : []),
          'Sign in to the Setjeka platform to review and sign it. The signed certificate, with a QR code to confirm it, is filed with the project documents.',
        ],
        action: { label: 'Review and sign', path: `/portal/projects/${projectId}#approvals` },
      },
    );
    return completion;
  }

  async withdrawCertificate(projectId: string, userId: string, id: string) {
    await this.setjekaOnly(projectId, userId);
    const c = await this.prisma.projectCompletion.findFirst({ where: { id, projectId } });
    if (!c) throw new NotFoundException('Certificate not found');
    if (c.status !== 'PENDING') throw new BadRequestException('Only a certificate still with the client can be withdrawn');
    return this.prisma.projectCompletion.update({ where: { id }, data: { status: 'WITHDRAWN' } });
  }

  /** The client signs (or rejects) the certificate of completion. */
  async decideCertificate(projectId: string, userId: string, id: string, dto: DecisionDto, meta: RequestMeta) {
    const project = await this.projects.findOneForOwner(projectId, userId);
    const isClient = await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } });
    if (!isClient) throw new ForbiddenException('The client signs the certificate of completion');
    const c = await this.prisma.projectCompletion.findFirst({ where: { id, projectId } });
    if (!c) throw new NotFoundException('Certificate not found');
    if (c.status !== 'PENDING') throw new BadRequestException('This certificate has already been answered or withdrawn');
    const { outcome, comment } = resolveOutcome(dto);
    const approve = isApproval(outcome);

    const record = await this.signoff.sign({
      projectId,
      subject: 'PROJECT_COMPLETION',
      subjectId: id,
      title: `Certificate of completion: ${project.name}`,
      kind: 'Certificate of completion',
      outcome,
      comment,
      signature: dto.signature,
      signedName: dto.signedName,
      requireName: true,
      signerId: userId,
      meta,
      facts: [
        ['Certificate', `Setjeka Group certifies that the works on this project were completed on ${longDate(c.completionDate)}. By approving, the client accepts the project as complete.`],
        ['Client', project.client ?? '-'],
        ['Location', project.location ?? '-'],
        ['Started', project.startDate ? longDate(project.startDate) : '-'],
        ['Completed', longDate(c.completionDate)],
        ['Issued by', `${c.issuedByName}, Setjeka Group, on ${longDate(c.createdAt)}`],
      ],
    });
    await this.prisma.projectCompletion.update({
      where: { id },
      data: { status: approve ? 'SIGNED' : 'REJECTED', decisionOutcome: outcome, decisionComment: comment, decidedById: userId, decidedAt: new Date() },
    });
    await this.signoff.fileInDocuments(record.id, ['Sign-offs and certificates', 'Completion'], `Certificate of completion - ${OUTCOME_LABEL[outcome]}`);

    const verdict = OUTCOME_LABEL[outcome].toLowerCase();
    await this.notifications.notifyByEmailToo(
      await this.notifications.setjekaTeamOf(projectId),
      {
        projectId,
        type: 'COMPLETION_CERTIFICATE_DECIDED',
        entityType: 'PROJECT',
        entityId: id,
        message: `${project.name}: the client ${verdict} the certificate of completion${comment ? ` - ${comment}` : ''}`,
        link: `/projects/${projectId}?tab=overview`,
      },
      {
        subject: `${project.name}: the client ${verdict} the certificate of completion`,
        paragraphs: [
          `The client (${record.signerName}) has ${verdict} the certificate of completion.`,
          ...(comment ? [`Comments: ${comment}`] : []),
          approve ? 'You can now mark the project as completed.' : 'Address the comments and send the certificate again.',
          'The signed certificate is filed under Documents > Sign-offs and certificates > Completion.',
        ],
        action: { label: 'Open the project', path: `/projects/${projectId}?tab=overview` },
      },
    );
    return this.state(projectId, userId);
  }

  private async tellEveryone(projectId: string, projectName: string, subject: string, paragraphs: string[]) {
    const people = [...new Map([...(await this.notifications.clientsOf(projectId)), ...(await this.notifications.setjekaTeamOf(projectId))].map((p) => [p.id, p])).values()];
    await this.notifications.notifyByEmailToo(
      people,
      { projectId, type: 'PROJECT_CLOSED', entityType: 'PROJECT', entityId: projectId, message: `${projectName}: ${subject}`, link: `/projects/${projectId}?tab=overview` },
      { subject: `${projectName}: ${subject}`, paragraphs, action: { label: 'Open the project', path: `/projects/${projectId}?tab=overview` } },
    );
  }

  /** Marks the project completed: once the client has signed the
   * certificate, or, if they haven't, with Setjeka's reason recorded. */
  async complete(projectId: string, userId: string, reason?: string) {
    const { project, me } = await this.setjekaOnly(projectId, userId);
    const signed = await this.prisma.projectCompletion.findFirst({ where: { projectId, status: 'SIGNED' }, orderBy: { decidedAt: 'desc' } });
    const why = reason?.trim() || null;
    if (!signed && (!why || why.length < 5)) {
      throw new BadRequestException('The client has not signed the certificate of completion. Give the reason for completing the project without it.');
    }
    await this.prisma.$transaction([
      this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'COMPLETED', closureType: 'COMPLETED', closureReason: why, closedAt: new Date(), closedByName: me.fullName },
      }),
      this.prisma.projectCompletion.updateMany({ where: { projectId, status: 'PENDING' }, data: { status: 'WITHDRAWN' } }),
    ]);
    await this.audit.log({ userId, action: 'EDIT', module: 'PROJECT_STRUCTURE', entityType: 'PROJECT', entityId: projectId, projectId, metadata: { closure: 'COMPLETED', clientSigned: Boolean(signed), reason: why } });
    await this.tellEveryone(projectId, project.name, 'the project is completed', [
      `Setjeka has marked ${project.name} as completed${signed ? `, following the client's signed certificate of completion (${longDate(signed.decidedAt!)})` : ''}.`,
      ...(why ? [`Note: ${why}`] : []),
      'All the project documents stay available in the platform, in their folders; the signed certificates are under Documents > Sign-offs and certificates.',
    ]);
    return this.state(projectId, userId);
  }

  /** Abandons the project: a reason is required; the project is archived and
   * its documents kept. */
  async abandon(projectId: string, userId: string, reason: string) {
    const { project, me } = await this.setjekaOnly(projectId, userId);
    const why = reason?.trim();
    if (!why || why.length < 10) throw new BadRequestException('Give the reason the project is being abandoned');
    await this.prisma.$transaction([
      this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'ARCHIVED', closureType: 'ABANDONED', closureReason: why, closedAt: new Date(), closedByName: me.fullName },
      }),
      this.prisma.projectCompletion.updateMany({ where: { projectId, status: 'PENDING' }, data: { status: 'WITHDRAWN' } }),
      this.prisma.stageTransition.updateMany({ where: { projectId, status: 'PENDING' }, data: { status: 'REJECTED', decisionComment: 'Withdrawn: the project was abandoned', decidedAt: new Date() } }),
    ]);
    await this.audit.log({ userId, action: 'DELETE', module: 'PROJECT_STRUCTURE', entityType: 'PROJECT', entityId: projectId, projectId, metadata: { closure: 'ABANDONED', reason: why } });
    await this.tellEveryone(projectId, project.name, 'the project has been abandoned', [
      `Setjeka has abandoned ${project.name} and archived it.`,
      `Reason: ${why}`,
      'The project and its documents are kept in the archive and can still be viewed in the platform.',
    ]);
    return this.state(projectId, userId);
  }
}
