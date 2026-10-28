import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { DeliverablesService } from '../inception/deliverables.service.js';
import { ConsentEventKind, ConsentStatus, ProjectStage } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

export class ConsentDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(200) authority?: string | null;
  @IsOptional() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @IsUUID() responsibleId?: string | null;
  @IsOptional() @IsEnum(ProjectStage) requiredByStage?: ProjectStage;
  @IsOptional() @IsDateString() plannedSubmission?: string | null;
  @IsOptional() @IsDateString() expectedDecisionAt?: string | null;
  @IsOptional() @IsString() @MaxLength(120) reference?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @IsOptional() @IsEnum(ConsentStatus) status?: ConsentStatus;
}

export class ConsentEventDto {
  @IsEnum(ConsentEventKind) kind!: ConsentEventKind;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
  /** The set submitted, the authority's comments or the approval letter. */
  @IsOptional() @IsUUID() documentId?: string;
  /** The authority's reference, often only known once submitted. */
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

// South African approvals the architect and engineers commonly carry
// (Architect 2.5, 2.11, 3.8, 5.14).
export const CONSENT_CATEGORIES = [
  'Site development plan',
  'Building plan approval',
  'Rezoning / land use',
  'Subdivision / consolidation',
  'Heritage',
  'Environmental (EIA)',
  'Fire',
  'Traffic / access',
  'Services and wayleaves',
  'Occupancy certificate',
  'Other',
];

const STAGE_ORDER: ProjectStage[] = ['INITIATION', 'INCEPTION', 'CONCEPT', 'DESIGN', 'DOCUMENTATION_PROCUREMENT', 'CONSTRUCTION', 'CLOSEOUT'];

const INCLUDE = {
  responsible: { select: { id: true, role: true, externalName: true, user: { select: { fullName: true } } } },
  events: {
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { createdBy: { select: { id: true, fullName: true } }, document: { select: { id: true, name: true, drawingNumber: true } } },
  },
} satisfies Prisma.ConsentApprovalInclude;

/** Authority submissions (Architect 2.5, 2.11, 3.8, 5.14; PM 1.7's
 * schedule of consents). The schedule itself is agreed at Stage 1; here each
 * consent is followed through its rounds with the authority. */
@Injectable()
export class AuthoritiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly deliverables: DeliverablesService,
  ) {}

  private shape(c: Prisma.ConsentApprovalGetPayload<{ include: typeof INCLUDE }>) {
    const submissions = c.events.filter((e) => e.kind === 'SUBMITTED' || e.kind === 'RESUBMITTED').length;
    const waitingSince = c.status === 'SUBMITTED' ? c.events.filter((e) => e.kind === 'SUBMITTED' || e.kind === 'RESUBMITTED').at(-1)?.date ?? c.submittedAt : null;
    return {
      ...c,
      responsibleName: c.responsible ? (c.responsible.user?.fullName ?? c.responsible.externalName) : null,
      submissions,
      waitingDays: waitingSince ? Math.floor((Date.now() - new Date(waitingSince).getTime()) / 86_400_000) : null,
      overdue: Boolean(c.expectedDecisionAt && c.status === 'SUBMITTED' && c.expectedDecisionAt.getTime() < Date.now()),
    };
  }

  async list(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const rows = await this.prisma.consentApproval.findMany({ where: { projectId }, include: INCLUDE, orderBy: [{ requiredByStage: 'asc' }, { createdAt: 'asc' }] });
    return { categories: CONSENT_CATEGORIES, items: rows.map((r) => this.shape(r)) };
  }

  /** The agreed Stage 1 schedule reopens for the client only while Stage 1
   * is current; later additions are delivery, not a change to that sign-off. */
  private async touchSchedule(projectId: string, userId: string) {
    const p = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { stage: true } });
    if (STAGE_ORDER.indexOf(p.stage) <= STAGE_ORDER.indexOf('INCEPTION')) await this.deliverables.touch(projectId, 'CONSENTS_SCHEDULE', userId);
  }

  private async data(projectId: string, dto: ConsentDto) {
    if (dto.responsibleId) {
      const m = await this.prisma.projectMember.findFirst({ where: { id: dto.responsibleId, projectId } });
      if (!m) throw new BadRequestException('The person responsible must be on the project');
    }
    const date = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);
    return {
      title: dto.title.trim(),
      authority: dto.authority?.trim() || null,
      category: dto.category?.trim() || null,
      responsibleId: dto.responsibleId ?? null,
      ...(dto.requiredByStage ? { requiredByStage: dto.requiredByStage } : {}),
      plannedSubmission: date(dto.plannedSubmission),
      expectedDecisionAt: date(dto.expectedDecisionAt),
      reference: dto.reference?.trim() || null,
      notes: dto.notes?.trim() || null,
      ...(dto.status === 'NOT_REQUIRED' || dto.status === 'IN_PREPARATION' || dto.status === 'NOT_STARTED' ? { status: dto.status } : {}),
    };
  }

  async create(projectId: string, userId: string, dto: ConsentDto) {
    await this.projects.findOneForOwner(projectId, userId);
    await this.prisma.consentApproval.create({ data: { projectId, ...(await this.data(projectId, dto)) } });
    await this.touchSchedule(projectId, userId);
    return this.list(projectId, userId);
  }

  async update(projectId: string, userId: string, id: string, dto: ConsentDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const c = await this.prisma.consentApproval.findFirst({ where: { id, projectId } });
    if (!c) throw new NotFoundException('Not found');
    const data = await this.data(projectId, dto);
    // Progress statuses come from the rounds with the authority.
    if (data.status && ['SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED_WITH_COMMENTS'].includes(c.status)) delete (data as { status?: unknown }).status;
    await this.prisma.consentApproval.update({ where: { id }, data });
    await this.touchSchedule(projectId, userId);
    return this.list(projectId, userId);
  }

  /** One round with the authority. Moves the approval's status on. */
  async addEvent(projectId: string, userId: string, id: string, dto: ConsentEventDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const c = await this.prisma.consentApproval.findFirst({ where: { id, projectId }, include: { events: { select: { kind: true } } } });
    if (!c) throw new NotFoundException('Not found');
    if (dto.documentId && !(await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: dto.documentId, projectId } }))) throw new BadRequestException('Attach a document from this project');
    const submitted = c.events.some((e) => e.kind === 'SUBMITTED' || e.kind === 'RESUBMITTED') || Boolean(c.submittedAt);
    if (['COMMENTS_RECEIVED', 'APPROVED', 'REJECTED'].includes(dto.kind) && !submitted) throw new BadRequestException('Record the submission first');
    if (dto.kind === 'SUBMITTED' && submitted) throw new BadRequestException('Already submitted - record a resubmission');
    if (dto.kind === 'RESUBMITTED' && !submitted) throw new BadRequestException('Record the first submission first');
    const when = new Date(dto.date);
    if (when.getTime() > Date.now() + 86_400_000) throw new BadRequestException("The date can't be in the future");
    const status: Partial<Record<ConsentEventKind, ConsentStatus>> = { SUBMITTED: 'SUBMITTED', RESUBMITTED: 'SUBMITTED', COMMENTS_RECEIVED: 'RETURNED_WITH_COMMENTS', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };
    await this.prisma.$transaction([
      this.prisma.consentEvent.create({ data: { consentId: id, kind: dto.kind, date: when, note: dto.note?.trim() || null, documentId: dto.documentId ?? null, createdById: userId } }),
      this.prisma.consentApproval.update({
        where: { id },
        data: {
          ...(status[dto.kind] ? { status: status[dto.kind] } : {}),
          ...(dto.kind === 'SUBMITTED' || dto.kind === 'RESUBMITTED' ? { submittedAt: when } : {}),
          ...(dto.kind === 'APPROVED' ? { approvedAt: when } : {}),
          ...(dto.reference?.trim() ? { reference: dto.reference.trim() } : {}),
        },
      }),
    ]);
    return this.list(projectId, userId);
  }
}
