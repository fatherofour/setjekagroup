import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContractForm, DefectList, DefectStatus, NotificationType, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma as P } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addDays, contractTerms } from '../common/contract-forms.js';
import { DESIGN_CONSULTANTS, holdersOf } from '../common/consultants.js';
import type { DefectDto } from './dto/defects.dto.js';
import { handoverOutstanding } from '../handover/handover.service.js';

const INCLUDE = {
  contract: { select: { id: true, title: true, contractorId: true, reviewerRole: true, contractor: { select: { name: true } } } },
  raisedBy: { select: { id: true, fullName: true } },
  verifiedBy: { select: { fullName: true } },
  _count: { select: { photos: true } },
} satisfies P.ContractDefectInclude;
type Row = P.ContractDefectGetPayload<{ include: typeof INCLUDE }>;

const DONE: DefectStatus[] = ['VERIFIED', 'DECLINED'];
const LIST_LABEL: Record<DefectList, string> = { PRACTICAL_COMPLETION: 'practical completion list', DEFECTS_LIABILITY: 'defects liability period', LATENT: 'latent defect' };
const STAGE = {
  PRACTICAL: { field: 'practicalCompletionAt', category: 'PRACTICAL_COMPLETION', label: 'Practical completion' },
  WORKS: { field: 'worksCompletionAt', category: 'WORKS_COMPLETION', label: 'Works completion' },
  FINAL: { field: 'finalCompletionAt', category: 'FINAL_COMPLETION', label: 'Final completion' },
} as const;
const day = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

type Contract = {
  id: string;
  title: string;
  contractorId: string;
  contractForm: ContractForm | null;
  reviewerRole: ProjectMemberRole;
  completionDate: Date | null;
  practicalCompletionAt: Date | null;
  worksCompletionAt: Date | null;
  defectsPeriodDays: number | null;
  defectsPeriodEndsAt: Date | null;
  finalCompletionAt: Date | null;
};

/** Completion and defects liability (the user's choice from the role-by-role
 * review, 2026-11-03; the donor app's defects_liability). For each contract
 * the reviewing consultant (or Setjeka) certifies practical completion, then
 * works completion once the practical completion list is cleared, which
 * starts the defects period; then final completion once that period has
 * ended and its defects are put right. Defects are listed against the
 * contract; the contractor puts each right and the consultant verifies it.
 * The client can report defects for Setjeka to issue, and sees them all; a
 * contractor sees only their own contracts. Retention follows the
 * certificates (valuations.service). */
@Injectable()
export class DefectsService {
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
    return {
      userId,
      name: user?.fullName ?? 'Someone',
      internal,
      roles,
      lead: internal || roles.includes('PROJECT_MANAGER') || roles.includes('DEVELOPMENT_MANAGER'),
      // Lists and verifies defects.
      inspector: internal || roles.some((r) => DESIGN_CONSULTANTS.includes(r) || ['QA_QC_MANAGER', 'PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'].includes(r)),
      client: !internal && roles.length > 0 && roles.every((r) => r === 'CLIENT'),
      contractor: !internal && roles.includes('CONTRACTOR'),
      contractorIds: new Set(members.flatMap((m) => (m.contractorId ? [m.contractorId] : []))),
    };
  }
  /** Setjeka's PM, or the consultant who administers the contract. */
  private certifier(w: Awaited<ReturnType<DefectsService['who']>>, c: { reviewerRole: Contract['reviewerRole'] }) {
    return w.lead || w.roles.some((r) => holdersOf(c.reviewerRole).includes(r));
  }

  private onContract(w: Awaited<ReturnType<DefectsService['who']>>, contractorId: string) {
    return w.internal || (w.contractor && w.contractorIds.has(contractorId));
  }

  private async people(projectId: string, where: P.ProjectMemberWhereInput) {
    return (await this.prisma.projectMember.findMany({ where: { projectId, userId: { not: null }, ...where }, select: { userId: true } })).map((m) => m.userId);
  }

  private async tell(projectId: string, userIds: (string | null | undefined)[], except: string, type: NotificationType, entityId: string, message: string) {
    for (const u of new Set(userIds.filter((x): x is string => Boolean(x)))) {
      if (u === except) continue;
      await this.notifications.notify({ userId: u, projectId, type, entityType: 'CONTRACT_DEFECT', entityId, message });
    }
  }

  // ---- Contracts: completion and the defects period -------------------------

  private position(w: Awaited<ReturnType<DefectsService['who']>>, c: Contract, defects: { list: DefectList; status: DefectStatus }[], handoverOpen = 0) {
    const terms = contractTerms(c.contractForm);
    const periodDays = c.defectsPeriodDays ?? terms.defectsPeriodDays;
    const openOf = (lists: DefectList[]) => defects.filter((d) => lists.includes(d.list) && !DONE.includes(d.status) && d.status !== 'REPORTED').length;
    const pcOpen = openOf(['PRACTICAL_COMPLETION']);
    const dlpOpen = openOf(['PRACTICAL_COMPLETION', 'DEFECTS_LIABILITY']);
    const cert = this.certifier(w, c);
    const stage = c.finalCompletionAt ? 'FINAL' : c.worksCompletionAt ? (c.defectsPeriodEndsAt && c.defectsPeriodEndsAt.getTime() <= Date.now() ? 'PERIOD_ENDED' : 'DEFECTS_PERIOD') : c.practicalCompletionAt ? 'PRACTICAL' : 'CONSTRUCTION';
    return {
      ...c,
      completion: terms.completion,
      periodDays,
      stage,
      counts: {
        open: defects.filter((d) => d.status === 'OPEN').length,
        rectified: defects.filter((d) => d.status === 'RECTIFIED').length,
        reported: defects.filter((d) => d.status === 'REPORTED').length,
        verified: defects.filter((d) => d.status === 'VERIFIED').length,
      },
      retention: c.finalCompletionAt ? 'ALL' : c.practicalCompletionAt ? 'HALF' : 'NONE',
      blockers: {
        works: pcOpen ? `${pcOpen} practical completion defect${pcOpen === 1 ? '' : 's'} still to be verified` : null,
        final:
          c.defectsPeriodEndsAt && c.defectsPeriodEndsAt.getTime() > Date.now()
            ? `The defects period runs to ${day(c.defectsPeriodEndsAt)}`
            : dlpOpen
              ? `${dlpOpen} defect${dlpOpen === 1 ? '' : 's'} still to be verified`
              : handoverOpen
                ? `${handoverOpen} handover document${handoverOpen === 1 ? '' : 's'} still to be accepted`
                : null,
      },
      can: {
        certifyPractical: cert && !c.practicalCompletionAt,
        certifyWorks: cert && Boolean(c.practicalCompletionAt) && !c.worksCompletionAt,
        certifyFinal: cert && Boolean(c.worksCompletionAt) && !c.finalCompletionAt,
        setPeriod: cert && !c.finalCompletionAt,
        listDefects: w.inspector,
        report: w.client,
      },
    };
  }

  private async contractRows(projectId: string, w: Awaited<ReturnType<DefectsService['who']>>, id?: string) {
    return this.prisma.projectContract.findMany({
      where: { projectId, ...(id ? { id } : {}), ...(w.contractor ? { contractorId: { in: [...w.contractorIds] } } : {}) },
      select: {
        id: true,
        title: true,
        contractorId: true,
        contractForm: true,
        reviewerRole: true,
        completionDate: true,
        practicalCompletionAt: true,
        worksCompletionAt: true,
        defectsPeriodDays: true,
        defectsPeriodEndsAt: true,
        finalCompletionAt: true,
        contractor: { select: { name: true } },
        defects: { select: { list: true, status: true } },
        handoverItems: { where: { status: { notIn: ['ACCEPTED', 'HANDED_OVER'] } }, select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async contracts(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    return (await this.contractRows(projectId, w)).map(({ defects, handoverItems, ...c }) => this.position(w, c, defects, handoverItems.length));
  }

  private async contract(projectId: string, w: Awaited<ReturnType<DefectsService['who']>>, id: string) {
    const [row] = await this.contractRows(projectId, w, id);
    if (!row) throw new NotFoundException('Contract not found');
    const { defects, handoverItems, ...c } = row;
    return { c, p: this.position(w, c, defects, handoverItems.length) };
  }

  async setPeriod(projectId: string, userId: string, contractId: string, days: number | null | undefined) {
    const w = await this.who(projectId, userId);
    const { c, p } = await this.contract(projectId, w, contractId);
    if (!p.can.setPeriod) throw new ForbiddenException('The consultant administering the contract, or Setjeka, sets the defects period before final completion');
    const periodDays = days ?? contractTerms(c.contractForm).defectsPeriodDays;
    await this.prisma.projectContract.update({ where: { id: contractId }, data: { defectsPeriodDays: days ?? null, defectsPeriodEndsAt: c.worksCompletionAt ? addDays(c.worksCompletionAt, periodDays) : null } });
    return (await this.contract(projectId, w, contractId)).p;
  }

  async certify(projectId: string, userId: string, contractId: string, stage: keyof typeof STAGE, dateIn: string) {
    const w = await this.who(projectId, userId);
    const { c, p } = await this.contract(projectId, w, contractId);
    const date = new Date(dateIn);
    if (!this.certifier(w, c)) throw new ForbiddenException('The consultant administering the contract, or Setjeka, certifies completion');
    const data: P.ProjectContractUncheckedUpdateInput = {};
    if (stage === 'PRACTICAL') {
      if (c.practicalCompletionAt) throw new BadRequestException('Practical completion is already certified');
      data.practicalCompletionAt = date;
    } else if (stage === 'WORKS') {
      if (!c.practicalCompletionAt) throw new BadRequestException('Certify practical completion first');
      if (c.worksCompletionAt) throw new BadRequestException('Works completion is already certified');
      if (date < c.practicalCompletionAt) throw new BadRequestException('Works completion comes on or after practical completion');
      if (p.blockers.works) throw new BadRequestException(`Works completion waits on the practical completion list: ${p.blockers.works}`);
      data.worksCompletionAt = date;
      data.defectsPeriodEndsAt = addDays(date, p.periodDays);
    } else {
      if (!c.worksCompletionAt || !c.defectsPeriodEndsAt) throw new BadRequestException('Certify works completion first');
      if (c.finalCompletionAt) throw new BadRequestException('Final completion is already certified');
      if (date < c.defectsPeriodEndsAt) throw new BadRequestException(`The defects period runs to ${day(c.defectsPeriodEndsAt)}`);
      const open = await this.prisma.contractDefect.count({ where: { contractId, list: { in: ['PRACTICAL_COMPLETION', 'DEFECTS_LIABILITY'] }, status: { in: ['OPEN', 'RECTIFIED', 'REPORTED'] } } });
      if (open) throw new BadRequestException(`Final completion waits on ${open} defect${open === 1 ? '' : 's'} still to be put right, verified or declined`);
      const pack = await handoverOutstanding(this.prisma, contractId);
      if (pack) throw new BadRequestException(`Final completion waits on ${pack} handover document${pack === 1 ? '' : 's'} still to be accepted`);
      data.finalCompletionAt = date;
    }
    await this.prisma.projectContract.update({ where: { id: contractId }, data });
    const s = STAGE[stage];
    await this.prisma.projectRegisterEntry.create({
      data: { projectId, register: 'certificates', category: s.category, title: `${s.label}: ${c.title}`, contractorId: c.contractorId, reference: c.title, date, status: 'ISSUED', createdById: userId },
    });
    const ends = stage === 'WORKS' ? `; the defects period runs to ${day(addDays(date, p.periodDays))}` : '';
    const retention = stage === 'PRACTICAL' ? '; half the retention can now be released' : stage === 'FINAL' ? '; the rest of the retention is released on the final valuation' : '';
    const who = [...(await this.people(projectId, { role: { in: ['CLIENT', 'QUANTITY_SURVEYOR'] } })), ...(await this.people(projectId, { contractorId: c.contractorId, role: 'CONTRACTOR' }))];
    await this.tell(projectId, who, userId, 'COMPLETION_CERTIFIED', contractId, `${c.title}: ${s.label.toLowerCase()} certified on ${day(date)}${ends}${retention}`);
    return (await this.contract(projectId, w, contractId)).p;
  }

  // ---- Defects ---------------------------------------------------------------

  private sees(w: Awaited<ReturnType<DefectsService['who']>>, d: Row) {
    return !w.contractor || w.contractorIds.has(d.contract.contractorId);
  }

  private shape(w: Awaited<ReturnType<DefectsService['who']>>, d: Row) {
    const mine = this.onContract(w, d.contract.contractorId);
    return {
      ...d,
      photoCount: d._count.photos,
      overdue: (d.status === 'OPEN' || d.status === 'REPORTED') && Boolean(d.dueDate && d.dueDate.getTime() < Date.now()),
      can: {
        issue: w.inspector && d.status === 'REPORTED',
        decline: w.inspector && d.status === 'REPORTED',
        rectify: mine && d.status === 'OPEN',
        verify: w.inspector && d.status === 'RECTIFIED',
        reopen: w.inspector && d.status === 'RECTIFIED',
        addPhotos: (mine || w.inspector) && !DONE.includes(d.status),
      },
    };
  }

  async list(projectId: string, userId: string) {
    const w = await this.who(projectId, userId);
    const rows = await this.prisma.contractDefect.findMany({ where: { projectId }, include: INCLUDE, orderBy: { sequence: 'desc' } });
    return rows.filter((d) => this.sees(w, d)).map((d) => this.shape(w, d));
  }

  private async load(w: Awaited<ReturnType<DefectsService['who']>>, projectId: string, id: string) {
    const d = await this.prisma.contractDefect.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!d || !this.sees(w, d)) throw new NotFoundException('Defect not found');
    return d;
  }

  async findOne(projectId: string, userId: string, id: string) {
    const w = await this.who(projectId, userId);
    return this.shape(w, await this.load(w, projectId, id));
  }

  private async syncRegister(d: Row, userId: string) {
    if (d.status === 'REPORTED') return;
    if (d.status === 'DECLINED') {
      if (d.registerEntryId) await this.prisma.projectRegisterEntry.deleteMany({ where: { id: d.registerEntryId } });
      return;
    }
    // The register names the practical completion list as such.
    const data = { title: `${d.number} ${d.title}`, category: d.list === 'PRACTICAL_COMPLETION' ? 'PRACTICAL_COMPLETION_LIST' : d.list, location: d.location, contractorId: d.contract.contractorId, dueDate: d.dueDate, status: d.status, completedAt: d.verifiedAt };
    if (d.registerEntryId && (await this.prisma.projectRegisterEntry.findUnique({ where: { id: d.registerEntryId } }))) {
      await this.prisma.projectRegisterEntry.update({ where: { id: d.registerEntryId }, data });
      return;
    }
    const e = await this.prisma.projectRegisterEntry.create({ data: { ...data, projectId: d.projectId, register: 'defects', createdById: userId } });
    await this.prisma.contractDefect.update({ where: { id: d.id }, data: { registerEntryId: e.id } });
  }

  private history(w: Awaited<ReturnType<DefectsService['who']>>, d: { history: unknown }, status: string, comment?: string | null) {
    return [...((d.history as unknown[]) ?? []), { status, at: new Date().toISOString(), by: w.userId, name: w.name, comment: comment?.trim() || null }] as P.InputJsonValue;
  }

  async create(projectId: string, userId: string, dto: DefectDto) {
    const w = await this.who(projectId, userId);
    if (!w.inspector && !w.client) throw new ForbiddenException('The consultants, QA/QC and Setjeka list defects; the client reports them');
    const { c } = await this.contract(projectId, w, dto.contractId);
    if (dto.list === 'PRACTICAL_COMPLETION') {
      if (w.client) throw new BadRequestException('Report defects found after handover; the consultants keep the practical completion list');
      if (c.worksCompletionAt) throw new BadRequestException('Works completion is certified: list defects in the defects liability period instead');
    } else if (dto.list === 'DEFECTS_LIABILITY') {
      if (!c.worksCompletionAt) throw new BadRequestException('The defects liability period starts at works completion; until then, use the practical completion list');
      if (c.finalCompletionAt) throw new BadRequestException('Final completion is certified: report it as a latent defect');
    } else if (!c.finalCompletionAt) throw new BadRequestException('A latent defect is one found after final completion');
    const last = await this.prisma.contractDefect.findFirst({ where: { projectId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const status: DefectStatus = w.client ? 'REPORTED' : 'OPEN';
    const d = await this.prisma.contractDefect.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        location: dto.location?.trim() || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : status === 'OPEN' ? addDays(new Date(), 14) : null,
        status,
        projectId,
        sequence,
        number: `DEF-${String(sequence).padStart(3, '0')}`,
        raisedById: userId,
        history: [{ status, at: new Date().toISOString(), by: userId, name: w.name, comment: w.client ? 'Reported by the client' : `Listed (${LIST_LABEL[dto.list]})` }],
      },
      include: INCLUDE,
    });
    await this.syncRegister(d, userId);
    if (status === 'REPORTED') {
      await this.tell(projectId, await this.people(projectId, { role: { in: ['PROJECT_MANAGER', ...holdersOf(c.reviewerRole)] } }), userId, 'DEFECT_REPORTED', d.id, `${d.number}: the client reported a defect on ${c.title} - "${d.title}". Issue it to the contractor or decline it.`);
    } else {
      await this.tell(projectId, await this.people(projectId, { contractorId: c.contractorId, role: 'CONTRACTOR' }), userId, 'DEFECT_ISSUED', d.id, `${d.number} "${d.title}" on ${c.title}: put it right${d.dueDate ? ` by ${day(d.dueDate)}` : ''}`);
    }
    return this.findOne(projectId, userId, d.id);
  }

  private async move(projectId: string, userId: string, id: string, can: keyof ReturnType<DefectsService['shape']>['can'], refuse: string, to: DefectStatus, comment: string | null | undefined, data: P.ContractDefectUncheckedUpdateInput = {}) {
    const w = await this.who(projectId, userId);
    const d = await this.load(w, projectId, id);
    if (!this.shape(w, d).can[can]) throw new BadRequestException(refuse);
    const updated = await this.prisma.contractDefect.update({ where: { id }, data: { ...data, status: to, history: this.history(w, d, to, comment) }, include: INCLUDE });
    await this.syncRegister(updated, userId);
    return updated;
  }

  async issue(projectId: string, userId: string, id: string, comment?: string, dueDate?: string) {
    const d = await this.move(projectId, userId, id, 'issue', 'Only a reported defect is issued, by a consultant, QA/QC or Setjeka', 'OPEN', comment || 'Issued to the contractor', { dueDate: dueDate ? new Date(dueDate) : addDays(new Date(), 14) });
    await this.tell(projectId, [...(await this.people(projectId, { contractorId: d.contract.contractorId, role: 'CONTRACTOR' })), d.raisedById], userId, 'DEFECT_ISSUED', id, `${d.number} "${d.title}" on ${d.contract.title}: put it right${d.dueDate ? ` by ${day(d.dueDate)}` : ''}`);
    return this.findOne(projectId, userId, id);
  }

  async decline(projectId: string, userId: string, id: string, reason: string) {
    const d = await this.move(projectId, userId, id, 'decline', 'Only a reported defect is declined, by a consultant, QA/QC or Setjeka', 'DECLINED', reason, { declineReason: reason.trim() });
    await this.tell(projectId, [d.raisedById], userId, 'DEFECT_DECIDED', id, `${d.number} "${d.title}" was not taken up as a defect - ${reason}`);
    return this.findOne(projectId, userId, id);
  }

  async rectify(projectId: string, userId: string, id: string, comment?: string) {
    const d = await this.move(projectId, userId, id, 'rectify', 'Only an open defect is marked put right, by its contractor', 'RECTIFIED', comment || 'Put right', { rectifiedAt: new Date(), rectifiedNote: comment?.trim() || null });
    const verifiers = await this.people(projectId, { role: { in: ['PROJECT_MANAGER', ...holdersOf(d.contract.reviewerRole)] } });
    await this.tell(projectId, [d.raisedById, ...verifiers], userId, 'DEFECT_RECTIFIED', id, `${d.number} "${d.title}" is put right: verify it on site`);
    return this.findOne(projectId, userId, id);
  }

  async verify(projectId: string, userId: string, id: string, comment?: string) {
    const d = await this.move(projectId, userId, id, 'verify', 'Only a defect marked put right is verified, by a consultant, QA/QC or Setjeka', 'VERIFIED', comment || 'Verified', { verifiedAt: new Date(), verifiedById: userId });
    await this.tell(projectId, await this.people(projectId, { contractorId: d.contract.contractorId, role: 'CONTRACTOR' }), userId, 'DEFECT_DECIDED', id, `${d.number} "${d.title}" was verified`);
    return this.findOne(projectId, userId, id);
  }

  async reopen(projectId: string, userId: string, id: string, reason: string) {
    const d = await this.move(projectId, userId, id, 'reopen', 'Only a defect marked put right is sent back', 'OPEN', reason, { rectifiedAt: null, reopened: { increment: 1 } });
    await this.tell(projectId, await this.people(projectId, { contractorId: d.contract.contractorId, role: 'CONTRACTOR' }), userId, 'DEFECT_DECIDED', id, `${d.number} "${d.title}" is not put right yet - ${reason}`);
    return this.findOne(projectId, userId, id);
  }
}
