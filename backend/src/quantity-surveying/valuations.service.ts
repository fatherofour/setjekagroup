import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { round } from '../cost-database/pricing.js';
import { SignoffService, signoffRootDir, type RequestMeta } from '../signoff/signoff.service.js';
import { OUTCOME_LABEL, isApproval, resolveOutcome, responseDue, type DecisionDto } from '../signoff/dto/decision.dto.js';
import { generateStoredName, uploadRootDir } from '../project-documents/upload.util.js';
import { QsAccessService } from './qs-access.service.js';
import { ContractsService } from './contracts.service.js';
import { valuationFigures } from './qs-math.js';
import { valuationPdf } from './valuation-pdf.js';
import type { CertifyValuationDto, CreateValuationDto, PayValuationDto, UpdateValuationDto } from './dto/qs.dto.js';

const CERTIFIED = ['CERTIFIED', 'APPROVED', 'PAID'] as const;
const CLIENT_SEES = ['CERTIFIED', 'APPROVED', 'REJECTED', 'PAID'] as const;
const PERSON = { select: { fullName: true } } as const;
const ARCHITECTS = ['ARCHITECT', 'ARCHITECT_ENGINEER'] as const;
const money = (currency: string, n: number) => `${currency} ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INCLUDE = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  contract: { include: { contractor: { select: { id: true, name: true } } } },
  preparedBy: PERSON,
  certifiedBy: PERSON,
  decidedBy: PERSON,
} as const;

/** Payment valuations (QS 5.8, 6.1) and the certificate cycle, as the user
 * decided on 28 Oct 2026: the QS prepares the valuation, the architect
 * reviews it (Architect 5.7), Setjeka's Project Manager issues the payment
 * certificate (PM 5.14), the client approves payment, and Setjeka records
 * it paid. The payment-certificates register follows each step. */
@Injectable()
export class ValuationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QsAccessService,
    private readonly contracts: ContractsService,
    private readonly signoff: SignoffService,
  ) {}

  private link(projectId: string) {
    return `/projects/${projectId}?tab=commercial&ctab=contracts`;
  }

  private async load(projectId: string, id: string) {
    const v = await this.prisma.valuation.findFirst({ where: { id, projectId }, include: INCLUDE });
    if (!v) throw new NotFoundException('Valuation not found');
    return v;
  }

  async list(projectId: string, userId: string, contractId?: string) {
    const a = await this.access.of(projectId, userId);
    if (!a.internal && !a.qs && !a.client) return [];
    return this.prisma.valuation.findMany({
      where: { projectId, ...(contractId ? { contractId } : {}), ...(a.internal || a.qs ? {} : { status: { in: [...CLIENT_SEES] } }) },
      include: { contract: { select: { id: true, title: true, currency: true, contractor: { select: { name: true } } } }, preparedBy: PERSON },
      orderBy: [{ contractId: 'asc' }, { number: 'desc' }],
    });
  }

  async get(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    const v = await this.load(projectId, id);
    if (!a.internal && !a.qs && !(a.client && (CLIENT_SEES as readonly string[]).includes(v.status))) throw new NotFoundException('Valuation not found');
    const reviews = v.registerEntryId
      ? await this.prisma.approvalRecord.findMany({
          where: { subject: 'REGISTER_ENTRY', subjectId: v.registerEntryId },
          select: { id: true, outcome: true, comment: true, signerName: true, signerRole: true, signedAt: true },
          orderBy: { signedAt: 'desc' },
        })
      : [];
    const preparer = a.internal || a.qs;
    return {
      ...v,
      reviews,
      can: {
        edit: preparer && v.status === 'DRAFT',
        submit: preparer && v.status === 'DRAFT',
        returnToQs: a.internal && v.status === 'SUBMITTED',
        certify: a.internal && v.status === 'SUBMITTED',
        decide: a.client && v.status === 'CERTIFIED',
        pay: a.internal && v.status === 'APPROVED',
        reopen: preparer && v.status === 'REJECTED',
        remove: preparer && v.status === 'DRAFT',
      },
    };
  }

  /** The last certified valuation before this one on the same contract. */
  private async previous(contractId: string, number: number) {
    return this.prisma.valuation.findFirst({
      where: { contractId, number: { lt: number }, status: { in: [...CERTIFIED] } },
      orderBy: { number: 'desc' },
      include: { lines: true },
    });
  }

  /** Work the figures out again from the lines and the contract's terms. */
  private async recompute(id: string) {
    const v = await this.prisma.valuation.findUniqueOrThrow({ where: { id }, include: { lines: true, contract: true } });
    const prev = await this.previous(v.contractId, v.number);
    const f = valuationFigures({
      lines: v.lines,
      materialsOnSite: v.materialsOnSite,
      retentionReleasePct: v.retentionReleasePct,
      contract: v.contract,
      previouslyCertified: prev?.cumulativeNet ?? 0,
    });
    await this.prisma.valuation.update({ where: { id }, data: f });
  }

  /** A new valuation starts from the contract bill and the approved
   * variations, each at the percentage last certified. */
  async create(projectId: string, userId: string, dto: CreateValuationDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const contract = await this.prisma.projectContract.findFirst({ where: { id: dto.contractId, projectId }, include: { costPlan: { include: { items: { orderBy: { sortOrder: 'asc' } } } } } });
    if (!contract) throw new BadRequestException('Contract not found on this project');
    const all = await this.prisma.valuation.findMany({ where: { contractId: contract.id }, select: { number: true, status: true, isFinal: true } });
    const open = all.find((v) => !(CERTIFIED as readonly string[]).includes(v.status));
    if (open) throw new BadRequestException(`Valuation ${open.number} on this contract is still open. Finish it first.`);
    if (all.some((v) => v.isFinal)) throw new BadRequestException('The final valuation on this contract has been certified');
    const number = all.reduce((m, v) => Math.max(m, v.number), 0) + 1;
    const prev = await this.previous(contract.id, number);
    const pctFor = (key: { costPlanItemId?: string; variationId?: string }) =>
      prev?.lines.find((l) => (key.costPlanItemId ? l.costPlanItemId === key.costPlanItemId : l.variationId === key.variationId))?.percentComplete ?? 0;
    const items = contract.costPlan?.items.filter((i) => i.amount !== 0) ?? [];
    const variations = await this.prisma.variation.findMany({ where: { contractId: contract.id, status: 'APPROVED' }, orderBy: { createdAt: 'asc' } });
    const workLines = items.length
      ? items.map((i) => ({ costPlanItemId: i.id, description: [i.ref, i.description].filter(Boolean).join(' ').slice(0, 300), contractAmount: i.amount, percentComplete: pctFor({ costPlanItemId: i.id }) }))
      : [{ description: 'Works under the contract', contractAmount: contract.contractSum, percentComplete: prev?.lines.find((l) => !l.costPlanItemId && !l.variationId)?.percentComplete ?? 0 }];
    const varLines = variations.map((x) => ({ variationId: x.id, description: `${x.number} ${x.title}`.slice(0, 300), contractAmount: x.assessedValue ?? x.estimatedValue, percentComplete: pctFor({ variationId: x.id }) }));
    const v = await this.prisma.valuation.create({
      data: {
        projectId,
        contractId: contract.id,
        number,
        isFinal: Boolean(dto.isFinal),
        valuationDate: new Date(dto.valuationDate),
        retentionReleasePct: dto.isFinal ? 100 : (prev?.retentionReleasePct ?? 0),
        materialsOnSite: 0,
        preparedById: userId,
        lines: {
          create: [...workLines, ...varLines].map((l, k) => ({ ...l, sortOrder: k, valueToDate: round((l.contractAmount * l.percentComplete) / 100) })),
        },
      },
    });
    await this.recompute(v.id);
    return this.get(projectId, userId, v.id);
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateValuationDto) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const v = await this.load(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Only a draft valuation can be changed');
    const { lines, ...data } = dto;
    const prev = await this.previous(v.contractId, v.number);
    const ops = [];
    for (const l of lines ?? []) {
      const line = v.lines.find((x) => x.id === l.id);
      if (!line) throw new BadRequestException('A line is not on this valuation');
      const before = prev?.lines.find((p) => (line.costPlanItemId ? p.costPlanItemId === line.costPlanItemId : line.variationId ? p.variationId === line.variationId : !p.costPlanItemId && !p.variationId));
      if (before && l.percentComplete < before.percentComplete - 0.0001 && !(line.contractAmount < 0)) {
        throw new BadRequestException(`"${line.description}" was certified at ${before.percentComplete}% before; a valuation can't take work back below that`);
      }
      ops.push(this.prisma.valuationLine.update({ where: { id: l.id }, data: { percentComplete: l.percentComplete, valueToDate: round((line.contractAmount * l.percentComplete) / 100) } }));
    }
    await this.prisma.$transaction([
      ...ops,
      this.prisma.valuation.update({ where: { id }, data: { ...data, valuationDate: data.valuationDate ? new Date(data.valuationDate) : undefined } }),
    ]);
    await this.recompute(id);
    return this.get(projectId, userId, id);
  }

  /** Bring in variations approved since the valuation was started. */
  async refresh(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const v = await this.load(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Only a draft valuation can be changed');
    const have = new Set(v.lines.map((l) => l.variationId).filter(Boolean));
    const missing = await this.prisma.variation.findMany({ where: { contractId: v.contractId, status: 'APPROVED', id: { notIn: [...have] as string[] } } });
    if (missing.length) {
      await this.prisma.valuationLine.createMany({
        data: missing.map((x, k) => ({ valuationId: id, variationId: x.id, description: `${x.number} ${x.title}`.slice(0, 300), contractAmount: x.assessedValue ?? x.estimatedValue, sortOrder: v.lines.length + k })),
      });
      await this.recompute(id);
    }
    return { added: missing.length, valuation: await this.get(projectId, userId, id) };
  }

  private async sheet(projectId: string, id: string) {
    const v = await this.load(projectId, id);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, projectCode: true } });
    const certified = (CERTIFIED as readonly string[]).includes(v.status) || v.status === 'REJECTED';
    return {
      v,
      sheet: {
        heading: certified && v.certificateNumber ? 'PAYMENT CERTIFICATE' : 'VALUATION',
        number: certified && v.certificateNumber ? v.certificateNumber : `No. ${v.number}`,
        projectName: project.name,
        projectCode: project.projectCode,
        contractTitle: v.contract.title,
        contractor: v.contract.contractor.name,
        contractSum: v.contract.contractSum,
        currency: v.contract.currency,
        valuationDate: v.valuationDate,
        isFinal: v.isFinal,
        preparedBy: v.preparedBy.fullName,
        certifiedBy: v.certifiedBy?.fullName ?? null,
        certifiedAt: v.certifiedAt,
        lines: v.lines.map((l) => ({ description: l.description, contractAmount: l.contractAmount, percentComplete: l.percentComplete, valueToDate: l.valueToDate, variation: Boolean(l.variationId) })),
        figures: {
          workDone: v.workDone,
          variationsDone: v.variationsDone,
          materialsOnSite: v.materialsOnSite,
          grossValuation: v.grossValuation,
          retention: v.retention,
          retentionPct: v.contract.retentionPct,
          retentionReleasePct: v.retentionReleasePct,
          cumulativeNet: v.cumulativeNet,
          previouslyCertified: v.previouslyCertified,
          netDue: v.netDue,
          vat: v.vat,
          vatPct: v.contract.vatPct,
          amountDue: v.amountDue,
        },
      },
    };
  }

  async pdf(projectId: string, userId: string, id: string) {
    await this.get(projectId, userId, id);
    const { v, sheet } = await this.sheet(projectId, id);
    return { bytes: await valuationPdf(sheet), filename: `${sheet.number} ${v.contract.title}.pdf`.replace(/[\\/:*?"<>|]/g, '-') };
  }

  /** The latest file on the valuation's register entry: what the next
   * signature is stamped onto. */
  private async currentFile(registerEntryId: string | null) {
    if (!registerEntryId) return { documentId: null, source: undefined };
    const entry = await this.prisma.projectRegisterEntry.findUnique({ where: { id: registerEntryId }, include: { document: { include: { revisions: { orderBy: { uploadedAt: 'desc' }, take: 1 } } } } });
    const rev = entry?.document?.revisions[0];
    return { documentId: entry?.documentId ?? null, source: rev ? { path: join(uploadRootDir(), rev.storedFilename), mimeType: rev.mimeType } : undefined };
  }

  /** A signed copy becomes the document's next revision, so the next
   * signature goes on top of it. */
  private async fileSigned(documentId: string, signedFilename: string, name: string, userId: string) {
    const storedFilename = generateStoredName(`${name}.pdf`);
    const to = join(uploadRootDir(), storedFilename);
    copyFileSync(join(signoffRootDir('signed'), signedFilename), to);
    const count = await this.prisma.documentRevision.count({ where: { documentId } });
    await this.prisma.documentRevision.create({
      data: { documentId, revisionNumber: String.fromCharCode(65 + Math.min(count, 25)), storedFilename, originalFilename: `${name} (signed).pdf`.replace(/[\\/:*?"<>|]/g, '-'), mimeType: 'application/pdf', fileSize: statSync(to).size, uploadedById: userId },
    });
  }

  /** Save the statement (or certificate) as a revision of the valuation's
   * document, so the architect's and the client's signatures stamp it. */
  private async fileSheet(projectId: string, userId: string, id: string, documentId: string | null) {
    const { v, sheet } = await this.sheet(projectId, id);
    const bytes = await valuationPdf(sheet);
    const originalFilename = `${sheet.number} ${v.contract.title}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
    const storedFilename = generateStoredName(originalFilename);
    writeFileSync(join(uploadRootDir(), storedFilename), bytes);
    const revision = { storedFilename, originalFilename, mimeType: 'application/pdf', fileSize: bytes.length, uploadedById: userId };
    if (documentId) {
      const count = await this.prisma.documentRevision.count({ where: { documentId } });
      await this.prisma.documentRevision.create({ data: { ...revision, documentId, revisionNumber: String.fromCharCode(65 + Math.min(count, 25)) } });
      return documentId;
    }
    const doc = await this.prisma.projectDocument.create({
      data: {
        projectId,
        name: `Valuation ${v.number}: ${v.contract.title} (${v.contract.contractor.name})`,
        documentType: 'Payment valuation',
        description: `The QS's valuation ${v.number} on ${v.contract.title}`,
        createdById: userId,
        revisions: { create: { ...revision, revisionNumber: 'A' } },
      },
    });
    return doc.id;
  }

  private entryData(v: { number: number; contract: { contractorId: string; currency: string }; valuationDate: Date; grossValuation: number; amountDue: number; retention: number; vat: number; netDue: number }, status: string, reference: string) {
    return {
      reference,
      contractorId: v.contract.contractorId,
      date: v.valuationDate,
      amount2: v.grossValuation,
      amount: v.amountDue,
      currency: v.contract.currency as never,
      status,
      notes: `Retention held ${money(v.contract.currency, v.retention)}. Due excluding VAT ${money(v.contract.currency, v.netDue)}, VAT ${money(v.contract.currency, v.vat)}.`,
    };
  }

  /** The QS sends the valuation for review: it goes on the payment
   * certificates register for the architect, and the PM is told. */
  async submit(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    let v = await this.load(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Only a draft valuation can be submitted');
    const earlier = await this.prisma.valuation.count({ where: { contractId: v.contractId, number: { lt: v.number }, status: { notIn: [...CERTIFIED] } } });
    if (earlier) throw new BadRequestException('An earlier valuation on this contract is not certified yet');
    if (v.grossValuation <= 0 && !v.isFinal) throw new BadRequestException('Value some work before submitting the valuation');
    await this.recompute(id);
    v = await this.load(projectId, id);
    const existing = v.registerEntryId ? await this.prisma.projectRegisterEntry.findUnique({ where: { id: v.registerEntryId } }) : null;
    const documentId = await this.fileSheet(projectId, userId, id, existing?.documentId ?? null);
    const data = { ...this.entryData(v, 'RECOMMENDED', `Valuation ${v.number}${v.isFinal ? ' (final)' : ''}`), documentId };
    const entry = existing
      ? await this.prisma.projectRegisterEntry.update({ where: { id: existing.id }, data })
      : await this.prisma.projectRegisterEntry.create({ data: { ...data, projectId, register: 'payment-certificates', createdById: userId } });
    await this.prisma.valuation.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), returnedReason: null, registerEntryId: entry.id } });

    const who = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
    const what = `valuation ${v.number} on ${v.contract.title} (${v.contract.contractor.name}): ${money(v.contract.currency, v.amountDue)} due`;
    await this.access.tell(projectId, await this.access.usersIn(projectId, [...ARCHITECTS]), userId, 'REGISTER_REVIEW_REQUESTED', `Payment certificates: ${who.fullName}'s ${what} is ready for your review`, `/projects/${projectId}?tab=registers&register=payment-certificates`);
    await this.access.tell(projectId, await this.access.usersIn(projectId, ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER']), userId, 'VALUATION_SUBMITTED', `${who.fullName} submitted ${what}`, this.link(projectId));
    return this.get(projectId, userId, id);
  }

  async returnToQs(projectId: string, userId: string, id: string, reason: string) {
    const a = await this.access.of(projectId, userId);
    this.access.setjeka(a, 'returns a valuation');
    const v = await this.load(projectId, id);
    if (v.status !== 'SUBMITTED') throw new BadRequestException('Only a submitted valuation can be returned');
    await this.prisma.valuation.update({ where: { id }, data: { status: 'DRAFT', returnedReason: reason.trim() } });
    if (v.registerEntryId) await this.prisma.projectRegisterEntry.update({ where: { id: v.registerEntryId }, data: { status: 'DRAFT' } });
    await this.access.tell(projectId, [v.preparedById], userId, 'VALUATION_RETURNED', `Valuation ${v.number} on ${v.contract.title} was returned to you: ${reason.trim()}`, this.link(projectId));
    return this.get(projectId, userId, id);
  }

  /** Setjeka's Project Manager issues the certificate (the user's decision,
   * 28 Oct 2026), signing it as the architect and the client sign theirs.
   * Where the project has an architect, their signed approval of the
   * valuation comes first (Architect 5.7). A rejection returns it to the QS
   * with the PM's comment. */
  async certify(projectId: string, userId: string, id: string, dto: CertifyValuationDto = {}, meta: RequestMeta = {}) {
    const a = await this.access.of(projectId, userId);
    this.access.setjeka(a, 'issues payment certificates');
    const v = await this.load(projectId, id);
    if (v.status !== 'SUBMITTED') throw new BadRequestException('Only a submitted valuation can be certified');
    if (!v.registerEntryId) throw new BadRequestException('Submit the valuation again; it has no register entry');
    const { outcome, comment } = resolveOutcome({ ...dto, outcome: dto.outcome ?? (dto.approve === undefined ? 'APPROVED' : undefined) });
    const facts: [string, string][] = [
      ['Valuation', `No. ${v.number}${v.isFinal ? ' (final)' : ''}`],
      ['Contractor', v.contract.contractor.name],
      ['Gross valuation', money(v.contract.currency, v.grossValuation)],
      ['Retention held', money(v.contract.currency, v.retention)],
      ['Amount due (incl. VAT)', money(v.contract.currency, v.amountDue)],
    ];
    if (!isApproval(outcome)) {
      if (!comment) throw new BadRequestException('Say why the valuation goes back to the QS');
      const { source } = await this.currentFile(v.registerEntryId);
      await this.signoff.sign({ projectId, subject: 'PAYMENT_CERTIFICATE', subjectId: id, title: `Valuation ${v.number}: ${v.contract.title}`, kind: 'Payment valuation, returned to the QS', outcome, comment, signature: dto.signature, signerId: userId, meta, facts, source });
      return this.returnToQs(projectId, userId, id, comment);
    }
    const architects = await this.access.usersIn(projectId, [...ARCHITECTS]);
    if (architects.length) {
      const review = await this.prisma.approvalRecord.findFirst({ where: { subject: 'REGISTER_ENTRY', subjectId: v.registerEntryId, signedAt: { gte: v.submittedAt ?? v.createdAt } }, orderBy: { signedAt: 'desc' } });
      if (!review) throw new BadRequestException("The architect reviews the valuation before it is certified (PROCSA Architect 5.7)");
      if (!isApproval(review.outcome)) throw new BadRequestException(`The architect's review was "${OUTCOME_LABEL[review.outcome]}". Return the valuation to the QS to revise.`);
    }
    const due = responseDue(dto.responseDueAt);
    let certificateNumber = v.certificateNumber;
    if (!certificateNumber) {
      const issued = await this.prisma.valuation.count({ where: { projectId, certificateNumber: { not: null } } });
      certificateNumber = `PC-${String(issued + 1).padStart(3, '0')}`;
    }
    await this.prisma.valuation.update({ where: { id }, data: { status: 'CERTIFIED', certificateNumber, certifiedById: userId, certifiedAt: new Date(), responseDueAt: due } });
    const fresh = await this.load(projectId, id);
    const entry = await this.prisma.projectRegisterEntry.findUniqueOrThrow({ where: { id: v.registerEntryId } });
    const documentId = await this.fileSheet(projectId, userId, id, entry.documentId);
    await this.prisma.projectRegisterEntry.update({ where: { id: entry.id }, data: { ...this.entryData(fresh, 'ISSUED', certificateNumber), documentId } });
    // The PM signs the certificate; the signed copy is what the client signs.
    const { source } = await this.currentFile(entry.id);
    const record = await this.signoff.sign({
      projectId,
      subject: 'PAYMENT_CERTIFICATE',
      subjectId: id,
      title: `Payment certificate ${certificateNumber}: ${v.contract.title}`,
      kind: 'Payment certificate, issued',
      outcome,
      comment,
      signature: dto.signature,
      signerId: userId,
      meta,
      facts: [['Certificate', certificateNumber], ...facts],
      source,
    });
    if (record.signedFilename) await this.fileSigned(documentId, record.signedFilename, `${certificateNumber} ${v.contract.title}`, userId);
    await this.access.tell(
      projectId,
      await this.access.usersIn(projectId, ['CLIENT']),
      userId,
      'PAYMENT_CERTIFICATE_ISSUED',
      `Payment certificate ${certificateNumber} for ${v.contract.contractor.name} (${money(v.contract.currency, fresh.amountDue)}) is waiting for your approval`,
      this.link(projectId),
    );
    await this.access.tell(projectId, [v.preparedById], userId, 'REGISTER_REVIEWED', `Valuation ${v.number} on ${v.contract.title} was certified as ${certificateNumber}`, this.link(projectId));
    return this.get(projectId, userId, id);
  }

  /** The client approves payment, as with a variation: the client alone,
   * never Setjeka on the client's behalf (Meeting 3 hard rule). */
  async decide(projectId: string, userId: string, id: string, dto: DecisionDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    const asClient = await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } });
    if (!asClient || user?.accountType !== 'EXTERNAL') throw new ForbiddenException('Only the client approves payment of a certificate');
    const v = await this.load(projectId, id);
    if (v.status !== 'CERTIFIED') throw new BadRequestException('This certificate is not waiting for a decision');
    const { outcome, comment } = resolveOutcome(dto);
    const entry = v.registerEntryId ? await this.prisma.projectRegisterEntry.findUnique({ where: { id: v.registerEntryId } }) : null;
    const { source } = await this.currentFile(v.registerEntryId);
    await this.signoff.sign({
      projectId,
      subject: 'PAYMENT_CERTIFICATE',
      subjectId: id,
      title: `Payment certificate ${v.certificateNumber}: ${v.contract.title}`,
      kind: 'Payment certificate',
      outcome,
      comment,
      signature: dto.signature,
      signerId: userId,
      meta,
      facts: [
        ['Certificate', v.certificateNumber ?? ''],
        ['Contractor', v.contract.contractor.name],
        ['Gross valuation', money(v.contract.currency, v.grossValuation)],
        ['Retention held', money(v.contract.currency, v.retention)],
        ['Amount due (incl. VAT)', money(v.contract.currency, v.amountDue)],
      ],
      source,
    });
    const approve = isApproval(outcome);
    await this.prisma.valuation.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionOutcome: outcome, decisionComment: comment } });
    if (!approve && entry) await this.prisma.projectRegisterEntry.update({ where: { id: entry.id }, data: { status: 'DRAFT' } });
    await this.access.tell(
      projectId,
      [...(await this.access.usersIn(projectId, ['PROJECT_MANAGER', 'DEVELOPMENT_MANAGER'])), v.preparedById, v.certifiedById],
      userId,
      'PAYMENT_CERTIFICATE_DECIDED',
      `Payment certificate ${v.certificateNumber} (${v.contract.contractor.name}): ${OUTCOME_LABEL[outcome].toLowerCase()} by the client${comment ? ` - ${comment}` : ''}`,
      this.link(projectId),
    );
    return this.get(projectId, userId, id);
  }

  async pay(projectId: string, userId: string, id: string, dto: PayValuationDto) {
    const a = await this.access.of(projectId, userId);
    this.access.setjeka(a, 'records payment');
    const v = await this.load(projectId, id);
    if (v.status !== 'APPROVED') throw new BadRequestException('The client approves the certificate before it is paid');
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    await this.prisma.valuation.update({ where: { id }, data: { status: 'PAID', paidAt, paymentReference: dto.paymentReference.trim() } });
    if (v.registerEntryId) await this.prisma.projectRegisterEntry.update({ where: { id: v.registerEntryId }, data: { status: 'PAID' } });
    await this.contracts.recordActual(projectId, userId, v.contractId, paidAt, v.amountDue);
    return this.get(projectId, userId, id);
  }

  /** A certificate the client rejected goes back to the QS to revise. */
  async reopen(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const v = await this.load(projectId, id);
    if (v.status !== 'REJECTED') throw new BadRequestException('Only a rejected certificate is reopened');
    await this.prisma.valuation.update({ where: { id }, data: { status: 'DRAFT', decisionOutcome: null, decisionComment: null, decidedById: null, decidedAt: null, certifiedById: null, certifiedAt: null } });
    return this.get(projectId, userId, id);
  }

  async remove(projectId: string, userId: string, id: string) {
    const a = await this.access.of(projectId, userId);
    this.access.preparer(a);
    const v = await this.load(projectId, id);
    if (v.status !== 'DRAFT') throw new BadRequestException('Only a draft valuation can be deleted');
    if (v.certificateNumber) throw new BadRequestException('This valuation was certified before, so it stays on the record');
    await this.prisma.$transaction([
      ...(v.registerEntryId ? [this.prisma.projectRegisterEntry.deleteMany({ where: { id: v.registerEntryId } })] : []),
      this.prisma.valuation.delete({ where: { id } }),
    ]);
  }
}
