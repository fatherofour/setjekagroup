import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { OUTCOME_LABEL } from '../signoff/dto/decision.dto.js';
import { fmtDate, fmtMoney, type ReportData } from './report-data.js';
import { nextPeriod, periodLabel, statusCards, thisPeriod, type Rag } from './report-text.js';

const hex = (h: string): RGB => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const C = {
  cream: hex('FAF8F2'),
  panel: hex('F0EDDF'),
  line: hex('D8D4C4'),
  green: hex('0F2A1F'),
  mid: hex('3F7A4F'),
  pale: hex('DFE8DA'),
  gold: hex('B9832F'),
  red: hex('A5312A'),
  ink: hex('1C261F'),
  muted: hex('5C6B5F'),
  white: rgb(1, 1, 1),
};
const RAG: Record<Rag, RGB> = { GREEN: C.mid, AMBER: C.gold, RED: C.red, GREY: C.muted };
const A4: [number, number] = [595.28, 841.89];
const M = 48;

function safe(font: PDFFont, text: string) {
  let out = '';
  for (const ch of text.replace(/\r/g, '')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += ch === '—' || ch === '–' ? '-' : ch === '…' ? '...' : '?';
    }
  }
  return out;
}

/** A small page writer: a cursor that wraps text and starts new pages. */
class Writer {
  doc!: PDFDocument;
  page!: PDFPage;
  y = 0;
  body!: PDFFont;
  bold!: PDFFont;
  serif!: PDFFont;
  footer = '';

  static async create(footer: string) {
    const w = new Writer();
    w.doc = await PDFDocument.create();
    [w.body, w.bold, w.serif] = await Promise.all([w.doc.embedFont(StandardFonts.Helvetica), w.doc.embedFont(StandardFonts.HelveticaBold), w.doc.embedFont(StandardFonts.TimesRomanBold)]);
    w.footer = footer;
    return w;
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: C.cream });
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: 26, color: C.panel });
    this.page.drawText(safe(this.body, this.footer), { x: M, y: 9, size: 8, font: this.body, color: C.muted });
    this.page.drawText(String(this.doc.getPageCount()), { x: A4[0] - M, y: 9, size: 8, font: this.body, color: C.muted });
    this.y = A4[1] - M;
  }

  ensure(h: number) {
    if (this.y - h < 40) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const para of safe(font, text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  heading(text: string) {
    this.ensure(44);
    this.y -= 10;
    this.page.drawText(safe(this.serif, text), { x: M, y: this.y - 18, size: 17, font: this.serif, color: C.green });
    this.y -= 26;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.7, color: C.line });
    this.y -= 12;
  }

  label(text: string, color: RGB = C.gold) {
    this.ensure(22);
    this.page.drawText(safe(this.bold, text.toUpperCase()), { x: M, y: this.y - 9, size: 9, font: this.bold, color });
    this.y -= 18;
  }

  para(text: string, size = 10.5, color: RGB = C.ink, indent = 0) {
    const lines = this.wrap(text, this.body, size, A4[0] - 2 * M - indent);
    for (const l of lines) {
      this.ensure(size + 5);
      this.page.drawText(l, { x: M + indent, y: this.y - size, size, font: this.body, color });
      this.y -= size + 4.5;
    }
    this.y -= 3;
  }

  bullets(items: string[], size = 10.5) {
    for (const t of items) {
      this.ensure(size + 6);
      this.page.drawCircle({ x: M + 4, y: this.y - size / 2 + 1, size: 1.8, color: C.mid });
      this.para(t, size, C.ink, 14);
    }
  }

  /** Headline figures as tiles: these are figures, not tables. */
  tiles(items: { value: string; label: string; tone?: RGB }[]) {
    const gap = 10;
    const per = Math.min(items.length, 4);
    const w = (A4[0] - 2 * M - gap * (per - 1)) / per;
    const h = 62;
    this.ensure(h + 12);
    items.slice(0, 4).forEach((t, i) => {
      const x = M + i * (w + gap);
      this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, color: t.tone ?? C.green });
      const value = safe(this.serif, t.value);
      let size = 20;
      while (this.serif.widthOfTextAtSize(value, size) > w - 16 && size > 10) size -= 1;
      this.page.drawText(value, { x: x + 10, y: this.y - 32, size, font: this.serif, color: C.white });
      const label = safe(this.bold, t.label.toUpperCase());
      let ls = 7.5;
      while (this.bold.widthOfTextAtSize(label, ls) > w - 16 && ls > 5.5) ls -= 0.25;
      this.page.drawText(label, { x: x + 10, y: this.y - 50, size: ls, font: this.bold, color: hex('E6D7B5') });
    });
    this.y -= h + 14;
  }

  card(title: string, rag: Rag, label: string, lines: string[]) {
    const width = A4[0] - 2 * M;
    const body = lines.flatMap((l) => this.wrap(l, this.body, 10, width - 30));
    const h = 34 + body.length * 14 + 8;
    this.ensure(h + 10);
    const top = this.y;
    this.page.drawRectangle({ x: M, y: top - h, width, height: h, color: C.white, borderColor: C.line, borderWidth: 0.7 });
    this.page.drawRectangle({ x: M, y: top - h, width: 4, height: h, color: RAG[rag] });
    this.page.drawText(safe(this.bold, title.toUpperCase()), { x: M + 14, y: top - 18, size: 10, font: this.bold, color: C.green });
    const lw = this.bold.widthOfTextAtSize(safe(this.bold, label), 7.5) + 14;
    this.page.drawRectangle({ x: M + width - lw - 10, y: top - 23, width: lw, height: 15, color: RAG[rag] });
    this.page.drawText(safe(this.bold, label), { x: M + width - lw - 3, y: top - 18.5, size: 7.5, font: this.bold, color: C.white });
    let y = top - 36;
    for (const l of body) {
      this.page.drawText(l, { x: M + 14, y: y - 10, size: 10, font: this.body, color: C.ink });
      y -= 14;
    }
    this.y = top - h - 10;
  }

  async save() {
    return Buffer.from(await this.doc.save());
  }
}

function cover(w: Writer, d: ReportData, title: string) {
  w.newPage();
  const p = w.page;
  p.drawRectangle({ x: 0, y: A4[1] - 300, width: A4[0], height: 300, color: C.green });
  p.drawText('SETJEKA GROUP', { x: M, y: A4[1] - 70, size: 11, font: w.bold, color: hex('E6D7B5') });
  const name = w.wrap(d.project.name, w.serif, 30, A4[0] - 2 * M);
  let y = A4[1] - 140;
  for (const l of name) {
    p.drawText(l, { x: M, y, size: 30, font: w.serif, color: C.white });
    y -= 36;
  }
  p.drawText(safe(w.serif, title), { x: M, y: y - 6, size: 18, font: w.serif, color: hex('E6D7B5') });
  p.drawText(safe(w.body, `${periodLabel(d)}   ·   ${d.project.stageLabel}`), { x: M, y: y - 34, size: 10.5, font: w.body, color: hex('CFE0D3') });
  w.y = A4[1] - 330;
}

/** The project summary (Meeting 3 §2.9: PDF, a summary across the project,
 * no tabular data): figures and plain sentences only. */
export async function summaryPdf(d: ReportData): Promise<Buffer> {
  const w = await Writer.create(`${d.project.name} · Project summary · Setjeka Group`);
  cover(w, d, 'Project Summary');
  const c = d.commercial;
  w.tiles([
    { value: d.programme.percent != null ? `${d.programme.percent}%` : '—', label: 'Programme complete' },
    { value: d.programme.finish ? fmtDate(d.programme.finish) : '—', label: 'Programmed completion', tone: C.mid },
    { value: c ? fmtMoney(c.totals.forecastFinal, c.currency) : '—', label: 'Forecast final cost', tone: c && c.totals.variance < 0 ? C.red : C.mid },
    { value: c ? fmtMoney(c.contingency.remaining, c.currency) : '—', label: 'Contingency remaining', tone: C.gold },
  ]);
  w.heading('At a glance');
  for (const card of statusCards(d)) w.card(card.area, card.rag, card.label, card.lines);

  w.heading('This period');
  w.bullets(thisPeriod(d));
  w.heading('Looking ahead');
  w.bullets(nextPeriod(d));

  if (d.risks.length) {
    w.heading('Principal risks');
    w.bullets(d.risks.slice(0, 5).map((r) => `${r.title} (${r.score >= 15 ? 'high' : r.score >= 8 ? 'medium' : 'low'})${r.mitigation ? `. Mitigation: ${r.mitigation.replace(/\.$/, '')}` : ''}${r.ownerName ? `. Owner: ${r.ownerName}` : ''}.`));
  }
  if (d.contracts.length) {
    w.heading('Contracts and payment certificates');
    w.bullets(
      d.contracts.map(
        (c) =>
          `${c.title} (${c.contractor}): contract sum ${fmtMoney(c.contractSum, c.currency)}${c.approvedVariations ? `, approved variations ${fmtMoney(c.approvedVariations, c.currency)}` : ''}; certified ${fmtMoney(c.certifiedNet, c.currency)} excluding VAT${c.retentionHeld ? `, retention held ${fmtMoney(c.retentionHeld, c.currency)}` : ''}${c.lastCertificate ? `; latest certificate ${c.lastCertificate.number}` : '; no certificate yet'}.`,
      ),
    );
  }
  if (d.waiting.length) {
    w.heading('Decisions required from the client');
    w.bullets(d.waiting.map((x) => `${x.title}${x.dueAt ? `, by ${fmtDate(x.dueAt)}` : ''}.`));
  }
  if (d.procsa) {
    w.heading('PROCSA responsibilities');
    w.para(`${d.procsa.done} of ${d.procsa.total} Development Manager and Project Manager responsibilities are complete across Stages 0 to 6.`);
    w.bullets(d.procsa.stages.filter((s) => s.total).map((s) => `Stage ${s.number} ${s.label}: ${s.done} of ${s.total}.`));
  }
  if (d.actions.length) {
    w.heading('Priority actions');
    w.bullets(d.actions.slice(0, 8).map((a) => `${a.action.length > 160 ? `${a.action.slice(0, 157)}…` : a.action} (${a.owner}${a.dueDate ? `, by ${fmtDate(a.dueDate)}` : ''}).`));
  }
  w.y -= 8;
  w.para(`Prepared on the Setjeka platform on ${fmtDate(d.generatedAt)} from the records held for this project.`, 8.5, C.muted);
  return w.save();
}

/** The project close-out report (PROCSA DM 6.9, PM 6.8). */
export async function closeoutPdf(d: ReportData): Promise<Buffer> {
  const w = await Writer.create(`${d.project.name} · Close-out report · Setjeka Group`);
  cover(w, d, 'Project Close-out Report');
  const r = d.registers;
  const c = d.commercial;
  const openDefects = r.defects.filter((x) => x.status === 'OPEN');
  w.tiles([
    { value: c ? fmtMoney(c.totals.forecastFinal, c.currency) : '—', label: 'Final cost (forecast)' },
    { value: String(r.finalAccounts.filter((x) => x.status === 'AGREED').length) + ` / ${r.finalAccounts.length}`, label: 'Final accounts agreed', tone: C.mid },
    { value: String(openDefects.length), label: 'Defects still open', tone: openDefects.length ? C.red : C.mid },
    { value: String(r.handover.filter((x) => x.status === 'DISTRIBUTED').length) + ` / ${r.handover.length}`, label: 'Handover docs issued', tone: C.gold },
  ]);

  w.heading('Completion');
  w.bullets(
    r.certificates.length
      ? r.certificates.map((x) => `${x.categoryLabel}${x.contractorName ? ` (${x.contractorName})` : ''}: ${x.statusLabel?.toLowerCase()}${x.date ? ` on ${fmtDate(x.date)}` : ''}.`)
      : ['No completion certificates have been recorded.'],
  );

  w.heading('Handover documentation');
  const groups = new Map<string, typeof r.handover>();
  for (const h of r.handover) groups.set(h.categoryLabel ?? 'Other', [...(groups.get(h.categoryLabel ?? 'Other') ?? []), h]);
  w.bullets(
    groups.size
      ? [...groups.entries()].map(([label, items]) => `${label}: ${items.length} recorded, ${items.filter((i) => i.status === 'DISTRIBUTED').length} distributed, ${items.filter((i) => i.status === 'OUTSTANDING').length} outstanding.`)
      : ['No handover documents have been recorded.'],
  );

  w.heading('Defects');
  if (r.defects.length) {
    const by = (cat: string) => r.defects.filter((x) => x.category === cat);
    w.bullets(
      [
        ['PRACTICAL_COMPLETION_LIST', 'Practical completion list'],
        ['DEFECTS_LIABILITY', 'Defects liability period'],
        ['LATENT', 'Latent defects'],
      ]
        .filter(([k]) => by(k).length)
        .map(([k, label]) => `${label}: ${by(k).length} recorded, ${by(k).filter((x) => x.status === 'VERIFIED').length} verified, ${by(k).filter((x) => x.status === 'OPEN').length} open.`),
    );
    if (openDefects.length) {
      w.label('Still open', C.red);
      w.bullets(openDefects.slice(0, 12).map((x) => `${x.title}${x.location ? ` (${x.location})` : ''}${x.dueDate ? `, to be rectified by ${fmtDate(x.dueDate)}` : ''}.`));
    }
  } else w.para('No defects have been recorded.');

  w.heading('Final accounts and claims');
  w.bullets([
    ...(r.finalAccounts.length
      ? r.finalAccounts.map((x) => `${x.contractorName ?? x.title}: ${x.statusLabel?.toLowerCase()}${x.amount2 != null ? `, final account ${fmtMoney(x.amount2, x.currency ?? d.project.currency)}` : ''}${x.amount != null ? ` against ${fmtMoney(x.amount, x.currency ?? d.project.currency)}` : ''}.`)
      : ['No final accounts recorded.']),
    ...(r.claims.length ? [`${r.claims.length} contractual claims recorded; ${r.claims.filter((x) => x.status === 'AGREED').length} agreed, ${r.claims.filter((x) => ['RECEIVED', 'UNDER_REVIEW', 'RECOMMENDED'].includes(x.status ?? '')).length} still open.`] : []),
  ]);

  if (c) {
    w.heading('Cost outcome');
    w.para(
      `Original budget ${fmtMoney(c.totals.budget, c.currency)}; approved variations ${fmtMoney(c.totals.approvedVariations, c.currency)}; revised budget ${fmtMoney(c.totals.revisedBudget, c.currency)}. Forecast final cost ${fmtMoney(c.totals.forecastFinal, c.currency)}, ${c.totals.variance < 0 ? `${fmtMoney(-c.totals.variance, c.currency)} over` : `${fmtMoney(c.totals.variance, c.currency)} within`} the revised budget. Contingency used: ${fmtMoney(c.contingency.drawn, c.currency)} of ${fmtMoney(c.contingency.original, c.currency)}.`,
    );
  }
  if (d.variations.length) {
    w.heading('Variations');
    const approved = d.variations.filter((v) => v.status === 'APPROVED');
    w.para(`${d.variations.length} variations raised; ${approved.length} approved by the client.`);
  }
  if (d.procsa) {
    w.heading('PROCSA responsibilities');
    w.para(`${d.procsa.done} of ${d.procsa.total} Development Manager and Project Manager responsibilities complete.`);
  }
  if (d.decisions.length) {
    w.heading('Decisions recorded in the period');
    w.bullets(d.decisions.slice(0, 10).map((x) => `${x.title}: ${OUTCOME_LABEL[x.outcome].toLowerCase()} by ${x.signerName}, ${fmtDate(x.signedAt)}.`));
  }
  w.y -= 8;
  w.para(`Prepared on the Setjeka platform on ${fmtDate(d.generatedAt)}. Signed copies of each decision are kept on the platform.`, 8.5, C.muted);
  return w.save();
}
