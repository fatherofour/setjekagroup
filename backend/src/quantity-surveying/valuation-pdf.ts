import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const GREEN = rgb(0.059, 0.165, 0.122);
const CREAM = rgb(0.98, 0.973, 0.949);
const GOLD = rgb(0.725, 0.514, 0.184);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.85, 0.83, 0.78);

export interface ValuationSheet {
  /** "VALUATION" while the QS's recommendation, "PAYMENT CERTIFICATE" once issued. */
  heading: string;
  number: string;
  projectName: string;
  projectCode: string | null;
  contractTitle: string;
  contractor: string;
  contractSum: number;
  currency: string;
  valuationDate: Date;
  isFinal: boolean;
  preparedBy: string;
  certifiedBy: string | null;
  certifiedAt: Date | null;
  lines: { description: string; contractAmount: number; percentComplete: number; valueToDate: number; variation: boolean }[];
  figures: {
    workDone: number;
    variationsDone: number;
    materialsOnSite: number;
    grossValuation: number;
    retention: number;
    retentionPct: number;
    retentionReleasePct: number;
    cumulativeNet: number;
    previouslyCertified: number;
    netDue: number;
    vat: number;
    vatPct: number;
    amountDue: number;
  };
}

const day = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
const money = (n: number) => n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** The QS's valuation statement, and (once the Project Manager issues it)
 * the payment certificate: the work valued line by line, then gross value,
 * retention, what was certified before, VAT and the amount due. */
export async function valuationPdf(v: ValuationSheet): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${v.heading === 'VALUATION' ? 'Valuation' : 'Payment certificate'} ${v.number}`);
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
    const label = v.isFinal ? `FINAL ${v.heading}` : v.heading;
    page.drawText(label, { x: W - M - bold.widthOfTextAtSize(label, 9), y: H - 40, size: 9, font: bold, color: GOLD });
    page.drawText(safe(bold, v.number), { x: W - M - bold.widthOfTextAtSize(safe(bold, v.number), 20), y: H - 66, size: 20, font: bold, color: rgb(1, 1, 1) });
    y = H - 120;
  };
  header();

  const field = (label: string, value: string, x: number, width: number) => {
    page.drawText(label.toUpperCase(), { x, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(fit(font, value, 10.5, width), { x, y: y - 14, size: 10.5, font, color: INK });
  };
  field('Project', v.projectCode ? `${v.projectName} (${v.projectCode})` : v.projectName, M, 300);
  field('Valuation date', day(v.valuationDate), M + 340, 170);
  y -= 38;
  field('Contract', v.contractTitle, M, 300);
  field('Contractor', v.contractor, M + 340, 170);
  y -= 38;
  field('Contract sum', `${v.currency} ${money(v.contractSum)}`, M, 300);
  field('Prepared by', v.preparedBy, M + 340, 170);
  y -= 44;

  const cols = [
    { label: 'Description', x: M, w: 250, right: false },
    { label: 'Contract', x: M + 250, w: 90, right: true },
    { label: '% done', x: M + 340, w: 60, right: true },
    { label: 'Value to date', x: M + 400, w: W - 2 * M - 400, right: true },
  ];
  const cell = (text: string, c: (typeof cols)[number], f: PDFFont, size: number, color = INK) => {
    const t = fit(f, text, size, c.w - 10);
    const x = c.right ? c.x + c.w - 5 - f.widthOfTextAtSize(t, size) : c.x + 5;
    page.drawText(t, { x, y, size, font: f, color });
  };
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: GREEN });
    for (const c of cols) cell(c.label.toUpperCase(), c, bold, 7.5, rgb(1, 1, 1));
    y -= 24;
  };
  tableHead();
  for (const l of v.lines) {
    if (y < 260) {
      page = pdf.addPage([W, H]);
      header();
      tableHead();
    }
    cell(l.variation ? `Variation: ${l.description}` : l.description, cols[0], font, 9);
    cell(money(l.contractAmount), cols[1], font, 9);
    cell(`${Math.round(l.percentComplete * 10) / 10}%`, cols[2], font, 9);
    cell(money(l.valueToDate), cols[3], font, 9);
    y -= 16;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.4, color: LINE });
  }

  if (y < 300) {
    page = pdf.addPage([W, H]);
    header();
  }
  y -= 12;
  const f = v.figures;
  const sums: [string, number, boolean?][] = [
    ['Work done to date', f.workDone],
    ['Variations to date', f.variationsDone],
    ['Materials on site', f.materialsOnSite],
    ['Gross valuation', f.grossValuation, true],
    [`Less retention (${f.retentionPct}%${f.retentionReleasePct ? `, ${f.retentionReleasePct}% released` : ''})`, -f.retention],
    ['Net valuation to date', f.cumulativeNet, true],
    ['Less previously certified', -f.previouslyCertified],
    ['Amount due excluding VAT', f.netDue, true],
    [`VAT (${f.vatPct}%)`, f.vat],
    ['Amount due', f.amountDue, true],
  ];
  for (const [label, value, strong] of sums) {
    const fnt = strong ? bold : font;
    page.drawText(safe(fnt, label), { x: M + 250, y, size: 9.5, font: fnt, color: INK });
    const t = `${v.currency} ${money(value)}`;
    page.drawText(t, { x: W - M - 5 - fnt.widthOfTextAtSize(t, 9.5), y, size: 9.5, font: fnt, color: INK });
    if (strong) page.drawLine({ start: { x: M + 250, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: LINE });
    y -= 17;
  }

  y -= 24;
  if (v.certifiedBy && v.certifiedAt) {
    page.drawText('CERTIFIED', { x: M, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(safe(font, `Issued by ${v.certifiedBy} for Setjeka, ${day(v.certifiedAt)}. Payment is subject to the client's approval.`), { x: M, y: y - 14, size: 9.5, font, color: INK });
  } else {
    page.drawText("QUANTITY SURVEYOR'S RECOMMENDATION", { x: M, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(safe(font, `Prepared by ${v.preparedBy} for review by the architect and certification by Setjeka.`), { x: M, y: y - 14, size: 9.5, font, color: INK });
  }

  for (const p of pdf.getPages()) {
    p.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: CREAM });
    p.drawText(safe(font, `${v.heading === 'VALUATION' ? 'Valuation' : 'Payment certificate'} ${v.number} · ${v.contractTitle} · prepared on the Setjeka platform`), { x: M, y: 10, size: 7.5, font, color: MUTED });
  }
  return pdf.save();
}
