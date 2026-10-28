import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { Currency, type ProjectMemberRole } from '../generated/prisma/enums.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SignoffService, type RequestMeta } from '../signoff/signoff.service.js';
import { resolveOutcome, type DecisionDto } from '../signoff/dto/decision.dto.js';
import { uploadRootDir } from '../project-documents/upload.util.js';
import { DELIVERY_REGISTERS, REGISTER_BY_KEY, type DeliveryRegister, type RegisterField } from './registers.js';

const INCLUDE = {
  contractor: { select: { id: true, name: true } },
  responsible: { select: { id: true, role: true, externalName: true, user: { select: { fullName: true } } } },
  document: { select: { id: true, name: true, revisions: { orderBy: { uploadedAt: 'desc' as const }, take: 1, select: { storedFilename: true, mimeType: true } } } },
  createdBy: { select: { fullName: true } },
} as const;

const REVIEW_SELECT = { id: true, subjectId: true, outcome: true, comment: true, method: true, signerName: true, signerRole: true, signedAt: true } as const;

/** The Stage 2 to 6 delivery registers (registers.ts). Setjeka staff keep
 * them; the client and consultants can read them; contractors read only
 * the ones that concern them (defects, certificates, claims, handover
 * documents, final accounts). */
@Injectable()
export class DeliveryRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly signoff: SignoffService,
    private readonly notifications: NotificationsService,
  ) {}

  definitions() {
    return DELIVERY_REGISTERS;
  }

  private async access(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    const roles = (await this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } })).map((m) => m.role);
    const contractor = !internal && roles.includes('CONTRACTOR');
    return { internal, contractor, roles };
  }

  /** Setjeka keeps every register; an outside role keeps the ones it's
   * named on (the architect: defects, handover documents, finishes). */
  private canEdit(r: DeliveryRegister, a: { internal: boolean; roles: ProjectMemberRole[] }) {
    return a.internal || Boolean(r.editableBy?.some((role) => a.roles.includes(role)));
  }

  private canReview(r: DeliveryRegister, a: { roles: ProjectMemberRole[] }) {
    return Boolean(r.review?.roles.some((role) => a.roles.includes(role)));
  }

  private register(key: string): DeliveryRegister {
    const r = REGISTER_BY_KEY.get(key);
    if (!r) throw new NotFoundException('Unknown register');
    return r;
  }

  /** Counts per register, for the register picker. */
  async summary(projectId: string, userId: string) {
    const a = await this.access(projectId, userId);
    const counts = await this.prisma.projectRegisterEntry.groupBy({ by: ['register'], where: { projectId }, _count: { _all: true } });
    const byKey = new Map(counts.map((c) => [c.register, c._count._all]));
    return DELIVERY_REGISTERS.filter((r) => !a.contractor || r.contractorsSee).map((r) => ({
      key: r.key,
      label: r.label,
      count: byKey.get(r.key) ?? 0,
      canEdit: this.canEdit(r, a),
      canDelete: a.internal,
      canReview: this.canReview(r, a),
    }));
  }

  async list(projectId: string, userId: string, key: string) {
    const r = this.register(key);
    const { contractor } = await this.access(projectId, userId);
    if (contractor && !r.contractorsSee) throw new ForbiddenException('This register is not shared with contractors');
    const rows = await this.prisma.projectRegisterEntry.findMany({ where: { projectId, register: key }, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    return this.withReviews(r, rows);
  }

  /** Each entry with its signed reviews, newest first, and whether it's one
   * the register's reviewer looks at. */
  private async withReviews<T extends { id: string; category: string | null; document: { revisions: unknown[] } | null }>(r: DeliveryRegister, rows: T[]) {
    const reviews = r.review
      ? await this.prisma.approvalRecord.findMany({ where: { subject: 'REGISTER_ENTRY', subjectId: { in: rows.map((x) => x.id) } }, select: REVIEW_SELECT, orderBy: { signedAt: 'desc' } })
      : [];
    return rows.map((x) => ({
      ...x,
      document: x.document ? { ...x.document, revisions: undefined } : null,
      reviewable: Boolean(r.review && (!r.review.categories || r.review.categories.includes(x.category ?? ''))),
      reviews: reviews.filter((v) => v.subjectId === x.id),
    }));
  }

  private label(r: DeliveryRegister, e: { title: string | null; reference: string | null; category: string | null; location: string | null }) {
    const cat = r.fields.find((f) => f.column === 'category')?.options?.[e.category ?? ''];
    return [e.reference, e.title, cat, e.location].filter(Boolean).join(' · ') || r.label;
  }

  /** The register's reviewers are told an entry is waiting for them. */
  private async askReview(projectId: string, userId: string, r: DeliveryRegister, entry: { id: string; title: string | null; reference: string | null; category: string | null; location: string | null }) {
    if (!r.review || (r.review.categories && !r.review.categories.includes(entry.category ?? ''))) return;
    const reviewers = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: r.review.roles }, userId: { not: null } }, select: { userId: true } });
    for (const u of new Set(reviewers.map((m) => m.userId!))) {
      if (u === userId) continue;
      await this.notifications.notify({
        userId: u,
        projectId,
        type: 'REGISTER_REVIEW_REQUESTED',
        entityType: 'PROJECT',
        entityId: projectId,
        message: `${r.label}: ${this.label(r, entry)} is ready for your review`,
        link: `/projects/${projectId}?tab=registers&register=${r.key}`,
      });
    }
  }

  /** The architect's signed review (Architect 5.7, 5.12, 6.2-6.4). The
   * linked certificate or document is stamped with the signature. */
  async review(projectId: string, userId: string, key: string, id: string, dto: DecisionDto, meta: RequestMeta) {
    const r = this.register(key);
    const a = await this.access(projectId, userId);
    if (!r.review) throw new BadRequestException('This register has no review step');
    if (!this.canReview(r, a)) throw new ForbiddenException(`Only the ${r.review.label.replace(/'s review$/, '').toLowerCase()} reviews this register`);
    const entry = await this.prisma.projectRegisterEntry.findFirst({ where: { id, projectId, register: key }, include: INCLUDE });
    if (!entry) throw new NotFoundException('Entry not found');
    if (r.review.categories && !r.review.categories.includes(entry.category ?? '')) throw new BadRequestException('This entry is not one for review');
    const { outcome, comment } = resolveOutcome(dto);
    const rev = entry.document?.revisions[0];
    const facts: [string, string][] = r.fields
      .filter((f) => f.inList && f.type !== 'longtext')
      .map((f): [string, string] => {
        const v = entry[f.column as keyof typeof entry];
        const text =
          v == null || v === ''
            ? '—'
            : f.type === 'enum'
              ? (f.options?.[String(v)] ?? String(v))
              : f.type === 'contractor'
                ? (entry.contractor?.name ?? '—')
                : f.type === 'date'
                  ? new Date(v as Date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })
                  : f.type === 'money'
                    ? `${entry.currency ?? ''} ${Math.round(Number(v)).toLocaleString('en-ZA')}`.trim()
                    : String(v);
        return [f.label, text];
      });
    await this.signoff.sign({
      projectId,
      subject: 'REGISTER_ENTRY',
      subjectId: id,
      title: `${r.label}: ${this.label(r, entry)}`,
      kind: r.review.label,
      outcome,
      comment,
      signature: dto.signature,
      signerId: userId,
      meta,
      facts,
      source: rev ? { path: join(uploadRootDir(), rev.storedFilename), mimeType: rev.mimeType } : undefined,
    });
    const leads = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'] }, userId: { not: null } }, select: { userId: true } });
    const signer = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
    for (const u of new Set([...leads.map((m) => m.userId!), entry.createdById])) {
      if (u === userId) continue;
      await this.notifications.notify({
        userId: u,
        projectId,
        type: 'REGISTER_REVIEWED',
        entityType: 'PROJECT',
        entityId: projectId,
        message: `${signer.fullName} reviewed ${r.label.toLowerCase()} ${this.label(r, entry)}: ${outcome.replace(/_/g, ' ').toLowerCase()}`,
        link: `/projects/${projectId}?tab=registers&register=${key}`,
      });
    }
    const [row] = await this.withReviews(r, [entry]);
    return row;
  }

  private async parse(projectId: string, r: DeliveryRegister, body: Record<string, unknown>, mode: 'create' | 'update') {
    const data: Record<string, unknown> = {};
    for (const f of r.fields) {
      const present = Object.prototype.hasOwnProperty.call(body, f.column) && body[f.column] !== undefined;
      if (!present) {
        if (mode === 'create' && f.required) throw new BadRequestException(`${f.label} is required`);
        continue;
      }
      data[f.column] = await this.value(projectId, f, body[f.column]);
      if (f.required && (data[f.column] === null || data[f.column] === '')) throw new BadRequestException(`${f.label} is required`);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'currency')) {
      const c = body.currency;
      if (c !== null && !Object.values(Currency).includes(c as Currency)) throw new BadRequestException('Unknown currency');
      data.currency = c;
    }
    return data;
  }

  private async value(projectId: string, f: RegisterField, raw: unknown): Promise<unknown> {
    if (raw === null || raw === '') return null;
    switch (f.type) {
      case 'text':
      case 'longtext': {
        if (typeof raw !== 'string') throw new BadRequestException(`${f.label} must be text`);
        const v = raw.trim();
        if (v.length > (f.type === 'text' ? 300 : 8000)) throw new BadRequestException(`${f.label} is too long`);
        return v || null;
      }
      case 'money':
      case 'decimal':
      case 'int': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) throw new BadRequestException(`${f.label} must be a number`);
        return f.type === 'int' ? Math.round(n) : n;
      }
      case 'date': {
        const d = new Date(String(raw));
        if (Number.isNaN(d.getTime())) throw new BadRequestException(`${f.label} must be a date`);
        return d;
      }
      case 'enum':
        if (typeof raw !== 'string' || !f.options || !(raw in f.options)) throw new BadRequestException(`Choose a valid ${f.label.toLowerCase()}`);
        return raw;
      case 'contractor':
        if (!(await this.prisma.contractor.findUnique({ where: { id: String(raw) }, select: { id: true } }))) throw new BadRequestException('Contractor not found');
        return String(raw);
      case 'member':
        if (!(await this.prisma.projectMember.findFirst({ where: { id: String(raw), projectId }, select: { id: true } }))) throw new BadRequestException('That person is not on this project');
        return String(raw);
      case 'document':
        if (!(await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: String(raw), projectId }, select: { id: true } }))) throw new BadRequestException('Document not found in this project');
        return String(raw);
    }
  }

  async create(projectId: string, userId: string, key: string, body: Record<string, unknown>) {
    const r = this.register(key);
    const a = await this.access(projectId, userId);
    if (!this.canEdit(r, a)) throw new ForbiddenException('Only Setjeka staff keep this register');
    const data = await this.parse(projectId, r, body, 'create');
    if (!data.currency && r.fields.some((f) => f.type === 'money')) {
      data.currency = (await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currency: true } })).currency;
    }
    const entry = await this.prisma.projectRegisterEntry.create({ data: { ...data, projectId, register: key, createdById: userId }, include: INCLUDE });
    await this.askReview(projectId, userId, r, entry);
    const [row] = await this.withReviews(r, [entry]);
    return row;
  }

  async update(projectId: string, userId: string, key: string, id: string, body: Record<string, unknown>) {
    const r = this.register(key);
    const a = await this.access(projectId, userId);
    if (!this.canEdit(r, a)) throw new ForbiddenException('Only Setjeka staff keep this register');
    const existing = await this.prisma.projectRegisterEntry.findFirst({ where: { id, projectId, register: key } });
    if (!existing) throw new NotFoundException('Entry not found');
    const data = await this.parse(projectId, r, body, 'update');
    const entry = await this.prisma.projectRegisterEntry.update({ where: { id }, data, include: INCLUDE });
    // A completion certificate created as a draft and later made one for
    // review still reaches the architect.
    if (existing.category !== entry.category) await this.askReview(projectId, userId, r, entry);
    const [row] = await this.withReviews(r, [entry]);
    return row;
  }

  async remove(projectId: string, userId: string, key: string, id: string) {
    this.register(key);
    const { internal } = await this.access(projectId, userId);
    if (!internal) throw new ForbiddenException('Only Setjeka staff keep this register');
    const existing = await this.prisma.projectRegisterEntry.findFirst({ where: { id, projectId, register: key } });
    if (!existing) throw new NotFoundException('Entry not found');
    await this.prisma.projectRegisterEntry.delete({ where: { id } });
  }
}
