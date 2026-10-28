import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IsDateString, IsEnum, IsHexColor, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, IsBoolean } from 'class-validator';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MarkupKind } from '../generated/prisma/enums.js';
import { uploadRootDir } from '../project-documents/upload.util.js';
import { cadSvgFile, isCad } from '../drawings/drawings.service.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export class CreateMarkupDto {
  @IsInt() @Min(1) page!: number;
  @IsEnum(MarkupKind) kind!: MarkupKind;
  @IsObject() geometry!: Record<string, unknown>;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
}

export class UpdateMarkupDto {
  @IsOptional() @IsObject() geometry?: Record<string, unknown>;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string | null;
  @IsOptional() @IsBoolean() resolved?: boolean;
}

export class MarkupIssueDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

type Pt = [number, number];
const unit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -0.01 && n <= 1.01;
const pt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && unit(p[0]) && unit(p[1]);

/** Check a markup's shape for its kind. Coordinates are fractions of the
 * unrotated page, origin top left. */
function checkGeometry(kind: MarkupKind, g: Record<string, unknown>) {
  const ok =
    kind === 'PEN'
      ? Array.isArray(g.points) && g.points.length >= 2 && g.points.length <= 4000 && g.points.every(pt)
      : kind === 'AREA'
        ? Array.isArray(g.points) && g.points.length >= 3 && g.points.length <= 500 && g.points.every(pt)
        : kind === 'RECTANGLE' || kind === 'CLOUD'
          ? unit(g.x) && unit(g.y) && unit(g.w) && unit(g.h) && (g.w as number) > 0 && (g.h as number) > 0
          : kind === 'ARROW' || kind === 'MEASURE'
            ? pt(g.from) && pt(g.to)
            : unit(g.x) && unit(g.y);
  if (!ok) throw new BadRequestException('That markup has no usable shape');
}

export const STAMPS = ['APPROVED', 'APPROVED AS NOTED', 'REVISE AND RESUBMIT', 'REJECTED', 'FOR CONSTRUCTION', 'FOR INFORMATION ONLY', 'NOT FOR CONSTRUCTION'];

export class CalibrationDto {
  @IsInt() @Min(1) page!: number;
  @IsNumber() @Min(0) @Max(1) x1!: number;
  @IsNumber() @Min(0) @Max(1) y1!: number;
  @IsNumber() @Min(0) @Max(1) x2!: number;
  @IsNumber() @Min(0) @Max(1) y2!: number;
  /** The real length of the line drawn, in metres. */
  @IsNumber() @Min(0.001) @Max(100000) realLength!: number;
}

type Calibration = { page: number; x1: number; y1: number; x2: number; y2: number; realLength: number };

/** Metres per page unit, from the page's calibration line. Lengths are
 * measured in the page's own units (points, or pixels for an image), so
 * the scale holds however the sheet is proportioned. */
export function metresPerUnit(c: Calibration | undefined, width: number, height: number) {
  if (!c) return null;
  const len = Math.hypot((c.x2 - c.x1) * width, (c.y2 - c.y1) * height);
  return len > 0 ? c.realLength / len : null;
}

export function measure(kind: MarkupKind, g: Record<string, unknown>, width: number, height: number, scale: number | null) {
  if (scale === null) return null;
  if (kind === 'MEASURE') {
    const [ax, ay] = g.from as Pt;
    const [bx, by] = g.to as Pt;
    return Math.hypot((bx - ax) * width, (by - ay) * height) * scale;
  }
  if (kind === 'AREA') {
    const p = (g.points as Pt[]).map(([x, y]) => [x * width, y * height]);
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % p.length];
      a += x1 * y2 - x2 * y1;
    }
    return (Math.abs(a) / 2) * scale * scale;
  }
  return null;
}

const INCLUDE = {
  author: { select: { id: true, fullName: true } },
  resolvedBy: { select: { fullName: true } },
  issue: { select: { id: true, title: true, status: true } },
} as const;

const HEX = (c: string) => {
  const n = Number.parseInt(c.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Drawing markup (register DOC row 51, FIELD row 65): redlines, clouds,
 * arrows, notes and pins on a drawing revision, kept apart from the file
 * itself. A pin can become a site issue. The marked-up PDF is produced on
 * demand, with the pins' notes listed on a closing page. */
@Injectable()
export class MarkupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Markups are the team's working notes: the client doesn't see them. */
  private async who(projectId: string, userId: string) {
    await this.projects.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    if (!internal && (await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }))) throw new ForbiddenException('Markups are kept for the project team');
    return { internal };
  }

  private async revision(projectId: string, documentId: string, revisionId: string) {
    const r = await this.prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, document: { projectId, deletedAt: null } }, include: { document: { select: { name: true, drawingNumber: true } } } });
    if (!r) throw new NotFoundException('Revision not found');
    return r;
  }

  async list(projectId: string, userId: string, documentId: string, revisionId: string) {
    await this.who(projectId, userId);
    await this.revision(projectId, documentId, revisionId);
    return this.prisma.drawingMarkup.findMany({ where: { revisionId }, include: INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async create(projectId: string, userId: string, documentId: string, revisionId: string, dto: CreateMarkupDto) {
    await this.who(projectId, userId);
    await this.revision(projectId, documentId, revisionId);
    checkGeometry(dto.kind, dto.geometry);
    if ((dto.kind === 'TEXT' || dto.kind === 'PIN') && !dto.text?.trim()) throw new BadRequestException(dto.kind === 'PIN' ? 'Say what the pin is about' : 'Type the note');
    if (dto.kind === 'STAMP' && !STAMPS.includes(dto.text?.trim().toUpperCase() ?? '')) throw new BadRequestException('Choose a stamp');
    return this.prisma.drawingMarkup.create({
      data: { projectId, documentId, revisionId, page: dto.page, kind: dto.kind, geometry: dto.geometry as object, color: dto.color ?? '#dc2626', text: dto.text?.trim() || null, authorId: userId },
      include: INCLUDE,
    });
  }

  private async owned(projectId: string, userId: string, id: string, needAuthor: boolean) {
    const { internal } = await this.who(projectId, userId);
    const m = await this.prisma.drawingMarkup.findFirst({ where: { id, projectId } });
    if (!m) throw new NotFoundException('Markup not found');
    if (needAuthor && !internal && m.authorId !== userId) throw new ForbiddenException('Only its author (or Setjeka) changes a markup');
    return m;
  }

  async update(projectId: string, userId: string, id: string, dto: UpdateMarkupDto) {
    const shapeChange = dto.geometry !== undefined || dto.color !== undefined || dto.text !== undefined;
    const m = await this.owned(projectId, userId, id, shapeChange);
    if (dto.geometry) checkGeometry(m.kind, dto.geometry);
    return this.prisma.drawingMarkup.update({
      where: { id },
      data: {
        ...(dto.geometry ? { geometry: dto.geometry as object } : {}),
        ...(dto.color ? { color: dto.color } : {}),
        ...(dto.text !== undefined ? { text: dto.text?.trim() || null } : {}),
        // Anyone on the team can mark a comment dealt with.
        ...(dto.resolved !== undefined ? (dto.resolved ? { resolvedAt: new Date(), resolvedById: userId } : { resolvedAt: null, resolvedById: null }) : {}),
      },
      include: INCLUDE,
    });
  }

  async remove(projectId: string, userId: string, id: string) {
    await this.owned(projectId, userId, id, true);
    await this.prisma.drawingMarkup.delete({ where: { id } });
  }

  /** A site observation on the drawing becomes an issue (FIELD row 65:
   * the markup is stored as a linked project record). */
  async raiseIssue(projectId: string, userId: string, id: string, dto: MarkupIssueDto) {
    await this.who(projectId, userId);
    const m = await this.prisma.drawingMarkup.findFirst({ where: { id, projectId }, include: { document: { select: { name: true, drawingNumber: true } }, revision: { select: { revisionNumber: true } } } });
    if (!m) throw new NotFoundException('Markup not found');
    if (m.issueId) throw new BadRequestException('An issue was already raised from this markup');
    if (dto.ownerId && !(await this.prisma.projectMember.findFirst({ where: { id: dto.ownerId, projectId } }))) throw new BadRequestException('The owner must be on the project');
    const where = `${m.document.drawingNumber ?? m.document.name} rev ${m.revision.revisionNumber}, page ${m.page}`;
    const issue = await this.prisma.projectIssue.create({
      data: {
        projectId,
        title: dto.title.trim(),
        description: [dto.description?.trim() || m.text, `Marked on drawing ${where}.`].filter(Boolean).join('\n\n'),
        ownerId: dto.ownerId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      include: { owner: { select: { userId: true } } },
    });
    await this.prisma.drawingMarkup.update({ where: { id }, data: { issueId: issue.id } });
    if (issue.owner?.userId && issue.owner.userId !== userId) {
      await this.notifications.notify({ userId: issue.owner.userId, projectId, type: 'ISSUE_ASSIGNED', entityType: 'ISSUE', entityId: issue.id, message: `Issue on drawing ${where}: ${issue.title}` });
    }
    return this.prisma.drawingMarkup.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  async calibrations(projectId: string, userId: string, documentId: string, revisionId: string) {
    await this.who(projectId, userId);
    await this.revision(projectId, documentId, revisionId);
    return this.prisma.drawingCalibration.findMany({ where: { revisionId }, include: { createdBy: { select: { fullName: true } } }, orderBy: { page: 'asc' } });
  }

  /** Set a page's scale by a line of known length (donor "scale
   * calibration"). One per page; setting it again replaces it. */
  async calibrate(projectId: string, userId: string, documentId: string, revisionId: string, dto: CalibrationDto) {
    await this.who(projectId, userId);
    await this.revision(projectId, documentId, revisionId);
    if (Math.hypot(dto.x2 - dto.x1, dto.y2 - dto.y1) < 0.005) throw new BadRequestException('Draw a longer line to set the scale');
    const data = { x1: dto.x1, y1: dto.y1, x2: dto.x2, y2: dto.y2, realLength: dto.realLength, createdById: userId };
    await this.prisma.drawingCalibration.upsert({ where: { revisionId_page: { revisionId, page: dto.page } }, update: data, create: { revisionId, page: dto.page, ...data } });
    return this.calibrations(projectId, userId, documentId, revisionId);
  }

  /** The revision with every markup drawn onto it, and a closing page that
   * lists the notes and pins with who made them. Images become a one-page
   * PDF first. */
  async markedUp(projectId: string, userId: string, documentId: string, revisionId: string) {
    await this.who(projectId, userId);
    const r = await this.revision(projectId, documentId, revisionId);
    const path = join(uploadRootDir(), r.storedFilename);
    if (!existsSync(path)) throw new NotFoundException('The drawing file is missing');
    const bytes = new Uint8Array(readFileSync(path));
    let pdf: PDFDocument;
    if (r.mimeType === 'application/pdf' || /\.pdf$/i.test(r.originalFilename)) {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } else if (isCad(r.originalFilename)) {
      // The SVG is 4000 px on its long side, as the viewer measured it.
      const svg = await cadSvgFile(r.storedFilename, r.originalFilename);
      const img = await loadImage(Buffer.from(svg));
      const canvas = createCanvas(img.width, img.height);
      canvas.getContext('2d').drawImage(img, 0, 0);
      pdf = await PDFDocument.create();
      const png = await pdf.embedPng(await canvas.encode('png'));
      pdf.addPage([img.width, img.height]).drawImage(png, { x: 0, y: 0, width: img.width, height: img.height });
    } else if (/^image\/(png|jpe?g)$/.test(r.mimeType)) {
      pdf = await PDFDocument.create();
      const img = r.mimeType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      throw new BadRequestException('Only PDF and image drawings can be exported with markups');
    }
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const markups = await this.prisma.drawingMarkup.findMany({ where: { revisionId }, include: INCLUDE, orderBy: { createdAt: 'asc' } });
    const calibrations = await this.prisma.drawingCalibration.findMany({ where: { revisionId } });
    const pages = pdf.getPages();
    const legend: { n: number; page: number; text: string; author: string; issue: string | null; resolved: boolean }[] = [];
    for (const m of markups) {
      const page = pages[m.page - 1];
      if (!page) continue;
      const n = m.kind === 'PIN' || m.kind === 'TEXT' ? legend.length + 1 : 0;
      const box = page.getCropBox();
      const scale = metresPerUnit(calibrations.find((c) => c.page === m.page), box.width, box.height);
      drawMarkup(page, m.kind, m.geometry as Record<string, unknown>, HEX(m.color), m.text, n, font, bold, { scale, author: m.author.fullName, at: m.createdAt });
      if (n) legend.push({ n, page: m.page, text: m.text ?? '', author: m.author.fullName, issue: m.issue?.title ?? null, resolved: Boolean(m.resolvedAt) });
    }
    if (legend.length) addLegend(pdf, `${r.document.drawingNumber ?? r.document.name} rev ${r.revisionNumber}`, legend, font, bold);
    const name = `${r.document.drawingNumber ?? r.document.name} rev ${r.revisionNumber} - marked up`.replace(/[^\w\- .]+/g, ' ').trim();
    return { bytes: Buffer.from(await pdf.save()), filename: `${name}.pdf` };
  }
}

/** Page coordinates for a fraction of the page, honouring the crop box. */
function mapper(page: PDFPage) {
  const box = page.getCropBox();
  return (x: number, y: number) => ({ x: box.x + x * box.width, y: box.y + box.height - y * box.height });
}

const safe = (font: PDFFont, s: string) =>
  [...s]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    })
    .join('');

function cloudPath(x: number, y: number, w: number, h: number, r: number) {
  // Scallops along each edge, drawn in SVG space (y down) from the top left.
  const arcs: string[] = [`M ${x} ${y}`];
  const edge = (len: number, dx: number, dy: number) => {
    const n = Math.max(2, Math.round(len / (r * 2)));
    const step = len / n;
    for (let i = 0; i < n; i++) arcs.push(`a ${step / 2} ${step / 2} 0 0 1 ${dx * step} ${dy * step}`);
  };
  edge(w, 1, 0);
  edge(h, 0, 1);
  edge(w, -1, 0);
  edge(h, 0, -1);
  return arcs.join(' ');
}

function drawMarkup(
  page: PDFPage,
  kind: MarkupKind,
  g: Record<string, unknown>,
  color: ReturnType<typeof rgb>,
  text: string | null,
  n: number,
  font: PDFFont,
  bold: PDFFont,
  extra: { scale: number | null; author: string; at: Date },
) {
  const at = mapper(page);
  const box = page.getCropBox();
  const thick = Math.max(1.2, Math.min(box.width, box.height) / 400);
  const label = (s: string, x: number, y: number) => {
    const size = thick * 6.5;
    const w = bold.widthOfTextAtSize(s, size);
    page.drawRectangle({ x: x - w / 2 - size * 0.4, y: y - size * 0.45, width: w + size * 0.8, height: size * 1.5, color: rgb(1, 1, 1), borderColor: color, borderWidth: thick / 2, opacity: 0.95 });
    page.drawText(s, { x: x - w / 2, y: y - size * 0.05, size, font: bold, color });
  };
  switch (kind) {
    case 'MEASURE': {
      const [fx, fy] = g.from as Pt;
      const [tx, ty] = g.to as Pt;
      const a = at(fx, fy);
      const b = at(tx, ty);
      page.drawLine({ start: a, end: b, thickness: thick, color });
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const tk = thick * 4;
      for (const p of [a, b]) page.drawLine({ start: { x: p.x - tk * Math.cos(ang), y: p.y - tk * Math.sin(ang) }, end: { x: p.x + tk * Math.cos(ang), y: p.y + tk * Math.sin(ang) }, thickness: thick, color });
      const len = measure('MEASURE', g, box.width, box.height, extra.scale);
      label(len === null ? 'scale not set' : `${len.toFixed(2)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2);
      break;
    }
    case 'AREA': {
      const pts = (g.points as Pt[]).map(([x, y]) => at(x, y));
      const o = pts[0];
      page.drawSvgPath(`M 0 0 ${pts.slice(1).map((p) => `L ${p.x - o.x} ${o.y - p.y}`).join(' ')} Z`, { x: o.x, y: o.y, color, opacity: 0.12, borderColor: color, borderWidth: thick });
      const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
      const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
      const area = measure('AREA', g, box.width, box.height, extra.scale);
      label(area === null ? 'scale not set' : `${area.toFixed(area < 100 ? 2 : 1)} m²`, cx, cy);
      break;
    }
    case 'STAMP': {
      const a = at(g.x as number, g.y as number);
      const words = safe(bold, (text ?? '').toUpperCase());
      const size = thick * 11;
      const w = bold.widthOfTextAtSize(words, size) + size * 1.6;
      const h = size * 2.9;
      page.drawRectangle({ x: a.x, y: a.y - h, width: w, height: h, borderColor: color, borderWidth: thick * 1.6, color: rgb(1, 1, 1), opacity: 0.85 });
      page.drawRectangle({ x: a.x + thick * 2.5, y: a.y - h + thick * 2.5, width: w - thick * 5, height: h - thick * 5, borderColor: color, borderWidth: thick * 0.6, opacity: 0 });
      page.drawText(words, { x: a.x + size * 0.8, y: a.y - size * 1.35, size, font: bold, color });
      const sub = safe(font, `${extra.author} · ${extra.at.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })}`);
      page.drawText(sub, { x: a.x + size * 0.8, y: a.y - size * 2.3, size: size * 0.42, font, color });
      break;
    }
    case 'PEN': {
      const pts = (g.points as Pt[]).map(([x, y]) => at(x, y));
      for (let i = 1; i < pts.length; i++) page.drawLine({ start: pts[i - 1], end: pts[i], thickness: thick, color, opacity: 0.9 });
      break;
    }
    case 'RECTANGLE': {
      const a = at(g.x as number, g.y as number);
      const w = (g.w as number) * box.width;
      const h = (g.h as number) * box.height;
      page.drawRectangle({ x: a.x, y: a.y - h, width: w, height: h, borderColor: color, borderWidth: thick, opacity: 0 });
      break;
    }
    case 'CLOUD': {
      const a = at(g.x as number, g.y as number);
      const w = (g.w as number) * box.width;
      const h = (g.h as number) * box.height;
      // drawSvgPath puts (0,0) at the given point with y running down.
      page.drawSvgPath(cloudPath(0, 0, w, h, Math.max(6, Math.min(w, h) / 8)), { x: a.x, y: a.y, borderColor: color, borderWidth: thick });
      break;
    }
    case 'ARROW': {
      const [fx, fy] = g.from as Pt;
      const [tx, ty] = g.to as Pt;
      const a = at(fx, fy);
      const b = at(tx, ty);
      page.drawLine({ start: a, end: b, thickness: thick, color });
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const len = thick * 8;
      for (const s of [-1, 1]) page.drawLine({ start: b, end: { x: b.x - len * Math.cos(ang + (s * Math.PI) / 7), y: b.y - len * Math.sin(ang + (s * Math.PI) / 7) }, thickness: thick, color });
      break;
    }
    case 'TEXT':
    case 'PIN': {
      const a = at(g.x as number, g.y as number);
      const r = thick * 6;
      page.drawCircle({ x: a.x, y: a.y, size: r, color, borderColor: rgb(1, 1, 1), borderWidth: thick / 2 });
      const label = String(n);
      const size = r * 1.1;
      page.drawText(label, { x: a.x - bold.widthOfTextAtSize(label, size) / 2, y: a.y - size / 3, size, font: bold, color: rgb(1, 1, 1) });
      if (kind === 'TEXT' && text) {
        const t = safe(font, text).slice(0, 120);
        const ts = thick * 6;
        const tw = font.widthOfTextAtSize(t, ts);
        page.drawRectangle({ x: a.x + r * 1.4, y: a.y - ts * 0.6, width: tw + ts, height: ts * 1.6, color: rgb(1, 1, 1), borderColor: color, borderWidth: thick / 2, opacity: 0.92 });
        page.drawText(t, { x: a.x + r * 1.4 + ts / 2, y: a.y - ts * 0.15, size: ts, font, color });
      }
      break;
    }
  }
}

function addLegend(pdf: PDFDocument, title: string, rows: { n: number; page: number; text: string; author: string; issue: string | null; resolved: boolean }[], font: PDFFont, bold: PDFFont) {
  const W = 595;
  const H = 842;
  const M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  page.drawText(safe(bold, `Markup notes · ${title}`), { x: M, y, size: 14, font: bold });
  y -= 26;
  const wrap = (s: string, width: number, size: number) => {
    const words = safe(font, s).split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  for (const r of rows) {
    const lines = wrap(r.text, W - 2 * M - 34, 10);
    const meta = `Page ${r.page} · ${r.author}${r.issue ? ` · issue: ${r.issue}` : ''}${r.resolved ? ' · dealt with' : ''}`;
    const need = lines.length * 13 + 22;
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    page.drawCircle({ x: M + 9, y: y - 4, size: 9, color: rgb(0.86, 0.15, 0.15) });
    const label = String(r.n);
    page.drawText(label, { x: M + 9 - bold.widthOfTextAtSize(label, 9) / 2, y: y - 7, size: 9, font: bold, color: rgb(1, 1, 1) });
    lines.forEach((l, i) => page.drawText(l, { x: M + 30, y: y - i * 13, size: 10, font }));
    page.drawText(safe(font, meta), { x: M + 30, y: y - lines.length * 13 - 2, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    y -= need;
  }
}
