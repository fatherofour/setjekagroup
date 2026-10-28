import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { cadToSvg } from './cad-svg.js';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { IssuePurpose } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { uploadRootDir } from '../project-documents/upload.util.js';
import { STAGE_LABEL } from '../reports/report-data.js';
import { drawingKey, readTitleBlock } from './title-block.js';
import { fromExcel, fromPdf, fromText, reconcile, type ExpectedDrawing } from './drawing-index.js';
import type { PlannedDrawingDto, UpdateDrawingDto, UpdateDrawingRevisionDto, UploadDrawingDto } from './dto/drawing.dto.js';

export const PURPOSE_LABEL: Record<IssuePurpose, string> = {
  FOR_INFORMATION: 'For information',
  FOR_COMMENT: 'For comment',
  FOR_COORDINATION: 'For co-ordination',
  FOR_CLIENT_APPROVAL: 'For client approval',
  FOR_AUTHORITY_SUBMISSION: 'For authority submission',
  FOR_PROCUREMENT: 'For procurement',
  FOR_CONSTRUCTION: 'For construction',
  AS_BUILT: 'As built',
};

const REGISTER_INCLUDE = {
  revisions: {
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      revisionNumber: true,
      purpose: true,
      revisionDate: true,
      uploadedAt: true,
      reviewStatus: true,
      originalFilename: true,
      mimeType: true,
      fileSize: true,
      uploadedBy: { select: { id: true, fullName: true } },
      clientApprovals: { where: { status: { not: 'WITHDRAWN' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, outcome: true } },
      transmittalItems: { where: { transmittal: { status: 'ISSUED' } }, select: { transmittal: { select: { id: true, transmittalNumber: true, issuedAt: true, purpose: true } } } },
    },
  },
  plannedDrawings: { select: { id: true, purpose: true, plannedDate: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.ProjectDocumentInclude;

type RegisterDoc = Prisma.ProjectDocumentGetPayload<{ include: typeof REGISTER_INCLUDE }>;

const DAY = 86_400_000;

/** The drawing register and documentation programme (Architect 2.1, 3.1,
 * 5.2, 5.10; Meeting 3 asked for a drawing register like Aconex's). A
 * drawing is a project document with a number read off the originator's
 * own sheet; a new revision of the same number attaches to it. */
@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  private async clientOnly(projectId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    if (user?.accountType !== 'EXTERNAL') return false;
    return Boolean(await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }));
  }

  private row(d: RegisterDoc) {
    const revisions = d.revisions.map((r) => ({
      ...r,
      purposeLabel: r.purpose ? PURPOSE_LABEL[r.purpose] : null,
      clientApproval: r.clientApprovals[0] ?? null,
      transmittals: r.transmittalItems.map((t) => t.transmittal),
      clientApprovals: undefined,
      transmittalItems: undefined,
    }));
    return {
      id: d.id,
      drawingNumber: d.drawingNumber,
      title: d.name,
      discipline: d.discipline,
      originator: d.originator,
      numberSource: d.drawingNumberSource,
      clientVisible: d.clientVisible,
      current: revisions[0] ?? null,
      revisions,
      planned: d.plannedDrawings,
      tags: d.tags.map((t) => t.tag),
      updatedAt: d.updatedAt,
    };
  }

  async register(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const client = await this.clientOnly(projectId, userId);
    const docs = await this.prisma.projectDocument.findMany({
      where: { deletedAt: null, projectId, drawingKey: { not: null }, ...(client ? { clientVisible: true } : {}) },
      include: REGISTER_INCLUDE,
    });
    return docs.map((d) => this.row(d)).sort((a, b) => (a.drawingNumber ?? '').localeCompare(b.drawingNumber ?? '', 'en', { numeric: true }));
  }

  /** Read the sheet before upload, and say whether the number is already
   * on the register (so the upload becomes its next revision). */
  async read(projectId: string, userId: string, file: Express.Multer.File) {
    await this.projects.findOneForOwner(projectId, userId);
    const titleBlock = await readTitleBlock(file.buffer ? new Uint8Array(file.buffer) : null, file.originalname);
    return { titleBlock, existing: await this.existing(projectId, titleBlock.drawingNumber) };
  }

  private async existing(projectId: string, number: string | null) {
    const key = drawingKey(number);
    if (!key) return null;
    const d = await this.prisma.projectDocument.findUnique({ where: { projectId_drawingKey: { projectId, drawingKey: key } }, include: REGISTER_INCLUDE });
    if (!d) return null;
    const r = this.row(d);
    return { id: r.id, drawingNumber: r.drawingNumber, title: r.title, discipline: r.discipline, originator: r.originator, current: r.current ? { revisionNumber: r.current.revisionNumber, purpose: r.current.purpose } : null, revisionNumbers: r.revisions.map((x) => x.revisionNumber) };
  }

  async upload(projectId: string, userId: string, dto: UploadDrawingDto, file: Express.Multer.File) {
    const discard = () => {
      try {
        unlinkSync(join(uploadRootDir(), file.filename));
      } catch {
        // already gone
      }
    };
    try {
      await this.projects.findOneForOwner(projectId, userId);
      const number = dto.drawingNumber.trim().toUpperCase();
      const key = drawingKey(number)!;
      const revision = dto.revision.trim().toUpperCase();
      let titleBlock: Prisma.InputJsonValue | undefined;
      if (dto.titleBlock) {
        try {
          titleBlock = JSON.parse(dto.titleBlock) as Prisma.InputJsonValue;
        } catch {
          throw new BadRequestException('Unreadable title block data');
        }
      }
      const revisionData = {
        revisionNumber: revision,
        storedFilename: file.filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById: userId,
        purpose: dto.purpose ?? null,
        revisionDate: dto.revisionDate ? new Date(dto.revisionDate) : null,
        ...(titleBlock !== undefined ? { titleBlock } : {}),
      };
      const found = await this.prisma.projectDocument.findUnique({ where: { projectId_drawingKey: { projectId, drawingKey: key } }, include: { revisions: { select: { revisionNumber: true } } } });
      let documentId: string;
      if (found) {
        // Meeting 3: revisions attach to the base drawing.
        if (found.revisions.some((r) => r.revisionNumber.toUpperCase() === revision)) throw new BadRequestException(`${number} revision ${revision} is already on the register`);
        await this.prisma.documentRevision.create({ data: { documentId: found.id, ...revisionData } });
        await this.prisma.projectDocument.update({
          where: { id: found.id },
          data: { ...(dto.title?.trim() ? { name: dto.title.trim() } : {}), ...(dto.discipline?.trim() ? { discipline: dto.discipline.trim() } : {}), ...(dto.originator?.trim() ? { originator: dto.originator.trim().toUpperCase() } : {}) },
        });
        documentId = found.id;
      } else {
        if (!dto.title?.trim()) throw new BadRequestException('Give the drawing a title');
        const doc = await this.prisma.projectDocument.create({
          data: {
            projectId,
            name: dto.title.trim(),
            documentType: 'Drawing',
            discipline: dto.discipline?.trim() || null,
            originator: dto.originator?.trim().toUpperCase() || null,
            drawingNumber: number,
            drawingKey: key,
            drawingNumberSource: dto.numberSource ?? 'MANUAL',
            createdById: userId,
            revisions: { create: revisionData },
          },
        });
        documentId = doc.id;
      }
      // The documentation programme picks the drawing up by its number.
      await this.prisma.plannedDrawing.updateMany({ where: { projectId, drawingKey: key, documentId: null }, data: { documentId } });
      return this.row(await this.prisma.projectDocument.findUniqueOrThrow({ where: { id: documentId }, include: REGISTER_INCLUDE }));
    } catch (e) {
      discard();
      throw e;
    }
  }

  async update(projectId: string, userId: string, documentId: string, dto: UpdateDrawingDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const d = await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, id: documentId, projectId } });
    if (!d) throw new NotFoundException('Drawing not found');
    const data: Prisma.ProjectDocumentUpdateInput = {
      ...(dto.title !== undefined ? { name: dto.title.trim() } : {}),
      ...(dto.discipline !== undefined ? { discipline: dto.discipline?.trim() || null } : {}),
      ...(dto.originator !== undefined ? { originator: dto.originator?.trim().toUpperCase() || null } : {}),
    };
    if (dto.drawingNumber !== undefined) {
      const number = dto.drawingNumber.trim().toUpperCase();
      const key = drawingKey(number)!;
      const clash = await this.prisma.projectDocument.findFirst({ where: { deletedAt: null, projectId, drawingKey: key, id: { not: documentId } } });
      if (clash) throw new BadRequestException(`${number} is already on the register`);
      Object.assign(data, { drawingNumber: number, drawingKey: key, drawingNumberSource: 'MANUAL' });
    }
    await this.prisma.projectDocument.update({ where: { id: documentId }, data });
    if (dto.drawingNumber !== undefined) await this.prisma.plannedDrawing.updateMany({ where: { projectId, drawingKey: drawingKey(dto.drawingNumber), documentId: null }, data: { documentId } });
    return this.row(await this.prisma.projectDocument.findUniqueOrThrow({ where: { id: documentId }, include: REGISTER_INCLUDE }));
  }

  async updateRevision(projectId: string, userId: string, documentId: string, revisionId: string, dto: UpdateDrawingRevisionDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const r = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, document: { projectId, deletedAt: null } } });
    if (!r) throw new NotFoundException('Revision not found');
    await this.prisma.documentRevision.update({
      where: { id: revisionId },
      data: {
        ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
        ...(dto.revisionDate !== undefined ? { revisionDate: dto.revisionDate ? new Date(dto.revisionDate) : null } : {}),
      },
    });
    return this.row(await this.prisma.projectDocument.findUniqueOrThrow({ where: { id: documentId }, include: REGISTER_INCLUDE }));
  }

  // ---- DWG / DXF viewer ------------------------------------------------------

  /** A DWG or DXF revision drawn as SVG, made once and kept beside the file. */
  async cadSvg(projectId: string, userId: string, documentId: string, revisionId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const r = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, document: { projectId, deletedAt: null } } });
    if (!r) throw new NotFoundException('Revision not found');
    return cadSvgFile(r.storedFilename, r.originalFilename);
  }

  // ---- Drawing index check ---------------------------------------------------

  /** Check the register against a drawing index or issue sheet (donor
   * sheet-index reconciliation): which drawings are missing, which are on
   * the register but not on the index, and which are at another revision. */
  async indexCheck(projectId: string, userId: string, input: { file?: Express.Multer.File; text?: string }) {
    await this.projects.findOneForOwner(projectId, userId);
    let expected: ExpectedDrawing[] = [];
    let source = 'pasted list';
    if (input.file) {
      const name = input.file.originalname.toLowerCase();
      source = input.file.originalname;
      if (name.endsWith('.pdf')) expected = await fromPdf(new Uint8Array(input.file.buffer));
      else if (name.endsWith('.xlsx')) expected = await fromExcel(input.file.buffer);
      else if (name.endsWith('.csv') || name.endsWith('.txt')) expected = fromText(input.file.buffer.toString('utf-8'));
      else throw new BadRequestException('Use a PDF, Excel (.xlsx) or CSV drawing index');
    } else if (input.text?.trim()) expected = fromText(input.text);
    else throw new BadRequestException('Upload the drawing index, or paste the list');
    if (!expected.length) throw new BadRequestException('No drawing numbers were found in that index');
    const register = await this.register(projectId, userId);
    return { source, ...reconcile(expected, register.map((r) => ({ id: r.id, number: r.drawingNumber!, title: r.title, revision: r.current?.revisionNumber ?? null }))) };
  }

  // ---- Documentation programme -------------------------------------------

  private programmeStatus(p: { purpose: IssuePurpose; plannedDate: Date; document: { revisions: { purpose: IssuePurpose | null; uploadedAt: Date }[] } | null }) {
    const issued = p.document?.revisions.filter((r) => r.purpose === p.purpose).sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())[0];
    if (issued) return { status: issued.uploadedAt.getTime() > p.plannedDate.getTime() + DAY ? ('ISSUED_LATE' as const) : ('ISSUED' as const), issuedAt: issued.uploadedAt };
    const now = Date.now();
    if (p.plannedDate.getTime() + DAY < now) return { status: 'LATE' as const, issuedAt: null };
    if (p.plannedDate.getTime() - 7 * DAY < now) return { status: 'DUE' as const, issuedAt: null };
    return { status: 'PLANNED' as const, issuedAt: null };
  }

  async programme(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const rows = await this.prisma.plannedDrawing.findMany({
      where: { projectId },
      include: {
        responsible: { select: { id: true, role: true, externalName: true, user: { select: { fullName: true } } } },
        document: { select: { id: true, drawingNumber: true, name: true, revisions: { select: { purpose: true, uploadedAt: true } } } },
      },
      orderBy: [{ plannedDate: 'asc' }],
    });
    const items = rows.map((r) => ({
      ...r,
      ...this.programmeStatus(r),
      purposeLabel: PURPOSE_LABEL[r.purpose],
      stageLabel: STAGE_LABEL[r.stage],
      responsibleName: r.responsible ? (r.responsible.user?.fullName ?? r.responsible.externalName) : null,
      document: r.document ? { id: r.document.id, drawingNumber: r.document.drawingNumber, title: r.document.name } : null,
    }));
    const count = (s: string) => items.filter((i) => i.status === s).length;
    return { items, summary: { total: items.length, issued: count('ISSUED') + count('ISSUED_LATE'), late: count('LATE'), due: count('DUE') } };
  }

  private async planData(projectId: string, dto: PlannedDrawingDto) {
    if (dto.responsibleId) {
      const m = await this.prisma.projectMember.findFirst({ where: { id: dto.responsibleId, projectId } });
      if (!m) throw new BadRequestException('The person responsible must be on the project');
    }
    const number = dto.drawingNumber?.trim().toUpperCase() || null;
    const key = drawingKey(number);
    const doc = key ? await this.prisma.projectDocument.findUnique({ where: { projectId_drawingKey: { projectId, drawingKey: key } }, select: { id: true } }) : null;
    return {
      drawingNumber: number,
      drawingKey: key,
      title: dto.title.trim(),
      discipline: dto.discipline?.trim() || null,
      stage: dto.stage,
      purpose: dto.purpose,
      plannedDate: new Date(dto.plannedDate),
      responsibleId: dto.responsibleId ?? null,
      notes: dto.notes?.trim() || null,
      documentId: doc?.id ?? null,
    };
  }

  async addPlanned(projectId: string, userId: string, dto: PlannedDrawingDto) {
    await this.projects.findOneForOwner(projectId, userId);
    await this.prisma.plannedDrawing.create({ data: { projectId, createdById: userId, ...(await this.planData(projectId, dto)) } });
    return this.programme(projectId, userId);
  }

  async updatePlanned(projectId: string, userId: string, id: string, dto: PlannedDrawingDto) {
    await this.projects.findOneForOwner(projectId, userId);
    const p = await this.prisma.plannedDrawing.findFirst({ where: { id, projectId } });
    if (!p) throw new NotFoundException('Not found');
    await this.prisma.plannedDrawing.update({ where: { id }, data: await this.planData(projectId, dto) });
    return this.programme(projectId, userId);
  }

  async removePlanned(projectId: string, userId: string, id: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const p = await this.prisma.plannedDrawing.findFirst({ where: { id, projectId } });
    if (!p) throw new NotFoundException('Not found');
    await this.prisma.plannedDrawing.delete({ where: { id } });
    return this.programme(projectId, userId);
  }

  // ---- Export --------------------------------------------------------------

  async exportRegister(projectId: string, userId: string) {
    const project = await this.projects.findOneForOwner(projectId, userId);
    const rows = await this.register(projectId, userId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Setjeka Group';
    const ws = wb.addWorksheet('Drawing register', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Drawing no.', key: 'number', width: 24 },
      { header: 'Title', key: 'title', width: 44 },
      { header: 'Discipline', key: 'discipline', width: 16 },
      { header: 'Originator', key: 'originator', width: 12 },
      { header: 'Current rev', key: 'rev', width: 11 },
      { header: 'Purpose of issue', key: 'purpose', width: 24 },
      { header: 'Revision date', key: 'revDate', width: 14 },
      { header: 'Uploaded', key: 'uploaded', width: 14 },
      { header: 'Review', key: 'review', width: 18 },
      { header: 'Revisions', key: 'history', width: 30 },
      { header: 'Transmittals', key: 'transmittals', width: 24 },
    ];
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A29' } };
    for (const r of rows) {
      ws.addRow({
        number: r.drawingNumber,
        title: r.title,
        discipline: r.discipline ?? '',
        originator: r.originator ?? '',
        rev: r.current?.revisionNumber ?? '',
        purpose: r.current?.purposeLabel ?? '',
        revDate: r.current?.revisionDate ?? null,
        uploaded: r.current?.uploadedAt ?? null,
        review: r.current?.reviewStatus?.replace(/_/g, ' ').toLowerCase() ?? '',
        history: r.revisions.map((x) => x.revisionNumber).reverse().join(', '),
        transmittals: [...new Set(r.revisions.flatMap((x) => x.transmittals.map((t) => t.transmittalNumber)))].join(', '),
      });
    }
    ws.getColumn('revDate').numFmt = 'dd mmm yyyy';
    ws.getColumn('uploaded').numFmt = 'dd mmm yyyy';
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer: buf, filename: `${project.name.replace(/[^\w\- ]+/g, ' ').trim()} - Drawing register.xlsx` };
  }
}

export const isCad = (name: string) => /\.(dwg|dxf)$/i.test(name);

/** The cached SVG of a DWG/DXF upload, made on first request. */
export async function cadSvgFile(storedFilename: string, originalFilename: string) {
  if (!isCad(originalFilename)) throw new BadRequestException('Only DWG and DXF drawings are drawn here');
  const src = join(uploadRootDir(), storedFilename);
  if (!existsSync(src)) throw new NotFoundException('The drawing file is missing');
  const cached = `${src}.svg`;
  if (existsSync(cached)) return readFileSync(cached, 'utf-8');
  try {
    const { svg } = await cadToSvg(new Uint8Array(readFileSync(src)), originalFilename);
    writeFileSync(cached, svg);
    return svg;
  } catch (e) {
    throw new BadRequestException(e instanceof Error ? `This drawing could not be drawn: ${e.message}` : 'This drawing could not be drawn');
  }
}
