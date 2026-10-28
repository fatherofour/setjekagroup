import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const GREEN = rgb(0.059, 0.165, 0.122);
const CREAM = rgb(0.98, 0.973, 0.949);
const GOLD = rgb(0.725, 0.514, 0.184);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.85, 0.83, 0.78);

export interface TransmittalSlip {
  number: string;
  projectName: string;
  projectCode: string | null;
  issuedAt: Date | null;
  createdAt: Date;
  purpose: string | null;
  from: string;
  createdBy: string;
  recipients: { name: string; company: string | null; role: string }[];
  items: { number: string | null; title: string; revision: string; purpose: string | null; file: string }[];
}

const day = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });

function safe(font: PDFFont, s: string) {
  return [...s]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    })
    .join('');
}

function fit(font: PDFFont, s: string, size: number, width: number) {
  let t = safe(font, s);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t.replace(/\s+$/, '')}…`;
}

/** The transmittal slip (donor "file transmittals"): what was issued, to
 * whom, when and why, on Setjeka's letterhead. */
export async function transmittalPdf(t: TransmittalSlip): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Transmittal ${t.number}`);
  pdf.setAuthor('Setjeka Group');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoPath = join(process.cwd(), 'assets', 'logo.png');
  const logo = existsSync(logoPath) ? await pdf.embedPng(readFileSync(logoPath)) : null;
  const W = 595;
  const H = 842;
  const M = 44;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H;

  const header = () => {
    page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: GREEN });
    if (logo) {
      page.drawRectangle({ x: M - 8, y: H - 78, width: 120, height: 56, color: CREAM });
      const s = Math.min(104 / logo.width, 44 / logo.height);
      page.drawImage(logo, { x: M, y: H - 72, width: logo.width * s, height: logo.height * s });
    }
    page.drawText('TRANSMITTAL', { x: W - M - bold.widthOfTextAtSize('TRANSMITTAL', 9), y: H - 40, size: 9, font: bold, color: GOLD });
    page.drawText(safe(bold, t.number), { x: W - M - bold.widthOfTextAtSize(safe(bold, t.number), 20), y: H - 66, size: 20, font: bold, color: rgb(1, 1, 1) });
    y = H - 120;
  };
  header();

  const field = (label: string, value: string, x: number, width: number) => {
    page.drawText(label.toUpperCase(), { x, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(fit(font, value, 10.5, width), { x, y: y - 14, size: 10.5, font, color: INK });
  };
  field('Project', t.projectCode ? `${t.projectName} (${t.projectCode})` : t.projectName, M, 300);
  field('Date', day(t.issuedAt ?? t.createdAt), M + 340, 170);
  y -= 38;
  field('From', t.from, M, 300);
  field('Purpose', t.purpose || 'For information', M + 340, 170);
  y -= 44;

  page.drawText('TO', { x: M, y, size: 7.5, font: bold, color: MUTED });
  y -= 14;
  for (const r of t.recipients.length ? t.recipients : [{ name: 'No recipients named', company: null, role: '' }]) {
    page.drawText(fit(font, [r.name, r.company, r.role].filter(Boolean).join(' · '), 10, W - 2 * M), { x: M, y, size: 10, font, color: INK });
    y -= 14;
  }
  y -= 14;

  const cols = [
    { label: 'No.', x: M, w: 26 },
    { label: 'Number', x: M + 26, w: 130 },
    { label: 'Title', x: M + 156, w: 196 },
    { label: 'Rev', x: M + 352, w: 40 },
    { label: 'Issued for', x: M + 392, w: W - 2 * M - 392 },
  ];
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: GREEN });
    for (const c of cols) page.drawText(c.label.toUpperCase(), { x: c.x + 5, y: y, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    y -= 24;
  };
  tableHead();
  t.items.forEach((it, i) => {
    if (y < 120) {
      page = pdf.addPage([W, H]);
      header();
      tableHead();
    }
    const cells = [String(i + 1), it.number ?? '—', it.title, it.revision, it.purpose ?? '—'];
    cells.forEach((v, k) => page.drawText(fit(k === 1 ? bold : font, v, 9.5, cols[k].w - 8), { x: cols[k].x + 5, y, size: 9.5, font: k === 1 ? bold : font, color: INK }));
    page.drawText(fit(font, it.file, 7.5, cols[2].w - 8), { x: cols[2].x + 5, y: y - 10, size: 7.5, font, color: MUTED });
    y -= 22;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: LINE });
  });

  y = Math.min(y - 20, 150);
  page.drawText('RECEIVED BY', { x: M, y, size: 7.5, font: bold, color: MUTED });
  page.drawLine({ start: { x: M, y: y - 34 }, end: { x: M + 220, y: y - 34 }, thickness: 0.6, color: INK });
  page.drawText('Name and signature', { x: M, y: y - 46, size: 7.5, font, color: MUTED });
  page.drawLine({ start: { x: M + 300, y: y - 34 }, end: { x: W - M, y: y - 34 }, thickness: 0.6, color: INK });
  page.drawText('Date', { x: M + 300, y: y - 46, size: 7.5, font, color: MUTED });

  for (const p of pdf.getPages()) {
    p.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: CREAM });
    p.drawText(safe(font, `Transmittal ${t.number} · issued on the Setjeka platform by ${t.createdBy}`), { x: M, y: 10, size: 7.5, font, color: MUTED });
  }
  return pdf.save();
}
