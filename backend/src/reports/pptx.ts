import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pptxModule from 'pptxgenjs';

// pptxgenjs is CommonJS with a default export; under nodenext the class
// arrives as .default (or as the module itself, depending on the loader).
type PptxClass = typeof pptxModule.default;
const PptxGenJS = ((pptxModule as unknown as { default?: PptxClass }).default ?? pptxModule) as PptxClass;
type Deck = InstanceType<PptxClass>;
type Slide = ReturnType<Deck['addSlide']>;
type TableRow = Parameters<Slide['addTable']>[0][number];
import { OUTCOME_LABEL } from '../signoff/dto/decision.dto.js';
import { fmtDate, fmtMoney, type ReportData } from './report-data.js';
import { nextPeriod, periodLabel, statusCards, thisPeriod, type Rag } from './report-text.js';

// Setjeka's own progress report palette (Project Solar Progress Report,
// 03 Aug 2026): cream, deep green, mid green, the gold-brown, warning red.
const C = {
  cream: 'FAF8F2',
  panel: 'F0EDDF',
  line: 'D8D4C4',
  green: '0F2A1F',
  green2: '173A29',
  mid: '3F7A4F',
  pale: 'DFE8DA',
  gold: 'B9832F',
  red: 'A5312A',
  ink: '1C261F',
  muted: '5C6B5F',
  white: 'FFFFFF',
};
const HEAD = 'Georgia';
const BODY = 'Helvetica';
const RAG_FILL: Record<Rag, string> = { GREEN: C.mid, AMBER: C.gold, RED: C.red, GREY: C.muted };

const W = 13.333;

function logoData(): string | null {
  const candidates = [process.env.REPORT_LOGO_PATH, join(process.cwd(), 'assets', 'logo.png')].filter((x): x is string => Boolean(x));
  const path = candidates.find((c) => existsSync(c)) ?? null;
  return path ? `image/png;base64,${readFileSync(path).toString('base64')}` : null;
}

/** The client-facing progress report (Meeting 3 §2.9: PowerPoint, editable).
 * Every slide is ordinary text, tables, shapes and a native chart, so
 * Setjeka can edit it before it goes to the client. */
export async function progressDeck(d: ReportData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Setjeka Group';
  pptx.company = 'Setjeka Group';
  pptx.title = `${d.project.name} Progress Report`;
  const reportDate = fmtDate(d.period.end);
  const footer = `${d.project.name} Progress Report`;
  const logo = logoData();

  pptx.defineSlideMaster({
    title: 'SETJEKA',
    background: { color: C.cream },
    objects: [
      { rect: { x: 0, y: 7.2, w: W, h: 0.3, fill: { color: C.panel } } },
      { text: { text: footer, options: { x: 0.5, y: 7.2, w: 8, h: 0.3, fontFace: BODY, fontSize: 9, color: C.muted } } },
    ],
    slideNumber: { x: 12.4, y: 7.2, w: 0.6, h: 0.3, fontFace: BODY, fontSize: 9, color: C.muted },
  });

  const header = (s: Slide, title: string) => {
    s.addText(title, { x: 0.5, y: 0.3, w: 9.5, h: 0.6, fontFace: HEAD, fontSize: 24, bold: true, color: C.green });
    s.addText(reportDate, { x: 0.5, y: 0.85, w: 6, h: 0.3, fontFace: BODY, fontSize: 11, color: C.muted });
    s.addText(d.project.name.toUpperCase(), { x: 8.3, y: 0.35, w: 4.5, h: 0.35, fontFace: BODY, fontSize: 10, bold: true, color: C.gold, align: 'right', charSpacing: 2 });
    s.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.25, w: W - 1, h: 0, line: { color: C.line, width: 1 } });
  };
  const tableStyle = { fontFace: BODY, fontSize: 10, color: C.ink, border: { type: 'solid' as const, color: C.line, pt: 0.5 }, valign: 'middle' as const };
  const th = (text: string) => ({ text, options: { bold: true, color: C.white, fill: { color: C.green2 }, fontSize: 9 } });

  // 1. Cover
  {
    const s = pptx.addSlide();
    s.background = { color: C.green };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.4, w: W, h: 1.1, fill: { color: C.green2 } });
    // The logo is dark, so it sits on a cream panel to stay legible.
    if (logo) {
      s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.5, w: 2.6, h: 1.1, fill: { color: C.cream } });
      s.addImage({ data: logo, x: 0.75, y: 0.6, w: 2.3, h: 0.9, sizing: { type: 'contain', w: 2.3, h: 0.9 } });
    }
    s.addText(d.project.name, { x: 0.6, y: 2.3, w: 11, h: 1, fontFace: HEAD, fontSize: 44, bold: true, color: C.white });
    s.addText('Progress Report', { x: 0.6, y: 3.3, w: 11, h: 0.6, fontFace: HEAD, fontSize: 24, color: 'E6D7B5' });
    s.addText(`Report period — ${periodLabel(d)}`, { x: 0.6, y: 4.0, w: 11, h: 0.4, fontFace: BODY, fontSize: 14, color: 'CFE0D3' });
    s.addText([d.project.stageLabel, d.project.location, d.project.client].filter(Boolean).join('   ·   '), { x: 0.6, y: 6.55, w: 12, h: 0.5, fontFace: BODY, fontSize: 12, color: 'CFE0D3' });
  }

  // 2. Executive summary
  {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Executive Summary');
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.5, w: 2.8, h: 5.4, fill: { color: C.green } });
    s.addText(d.programme.percent != null ? `${d.programme.percent}%` : '—', { x: 0.5, y: 1.9, w: 2.8, h: 1.2, fontFace: HEAD, fontSize: 54, bold: true, color: C.white, align: 'center' });
    s.addText('PROGRAMME COMPLETE', { x: 0.5, y: 3.1, w: 2.8, h: 0.4, fontFace: BODY, fontSize: 10, bold: true, color: 'E6D7B5', align: 'center', charSpacing: 2 });
    s.addText(
      [
        { text: d.project.stageLabel, options: { breakLine: true } },
        { text: d.programme.finish ? `Completion ${fmtDate(d.programme.finish)}` : 'Completion not programmed', options: { breakLine: true } },
        { text: d.team.projectManager.length ? `PM: ${d.team.projectManager.join(', ')}` : '' },
      ],
      { x: 0.7, y: 3.8, w: 2.4, h: 2.6, fontFace: BODY, fontSize: 11, color: 'CFE0D3', valign: 'top' },
    );
    statusCards(d).forEach((card, i) => {
      const x = 3.6 + (i % 2) * 4.65;
      const y = 1.5 + Math.floor(i / 2) * 2.75;
      s.addShape(pptx.ShapeType.rect, { x, y, w: 4.45, h: 2.6, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
      s.addText(card.area.toUpperCase(), { x: x + 0.2, y: y + 0.12, w: 2.4, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.green, charSpacing: 1 });
      s.addText(card.label, { x: x + 2.35, y: y + 0.14, w: 1.95, h: 0.32, fontFace: BODY, fontSize: 8, bold: true, color: C.white, align: 'center', fill: { color: RAG_FILL[card.rag] } });
      s.addText(
        card.lines.map((t, j) => ({ text: t, options: { bullet: j > 0 ? { indent: 12 } : false, breakLine: true } })),
        { x: x + 0.2, y: y + 0.55, w: 4.05, h: 1.95, fontFace: BODY, fontSize: 10.5, color: C.ink, valign: 'top', paraSpaceAfter: 4 },
      );
    });
  }

  // 3. Status detail
  {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Status Detail');
    const cards = statusCards(d);
    const blocks: [string, string[]][] = [
      ['COMMERCIAL', cards.find((c) => c.area === 'Commercial')!.lines],
      ['PROGRAMME', cards.find((c) => c.area === 'Programme')!.lines],
      ['THIS PERIOD', thisPeriod(d)],
      ['LOOKING AHEAD', nextPeriod(d)],
    ];
    blocks.forEach(([title, lines], i) => {
      const x = 0.5 + (i % 2) * 6.25;
      const y = 1.5 + Math.floor(i / 2) * 2.85;
      s.addShape(pptx.ShapeType.rect, { x, y, w: 6.05, h: 2.65, fill: { color: i < 2 ? C.white : C.pale }, line: { color: C.line, width: 0.75 } });
      s.addText(title, { x: x + 0.2, y: y + 0.12, w: 5, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.gold, charSpacing: 2 });
      s.addText(
        lines.slice(0, 7).map((t) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: true } })),
        { x: x + 0.2, y: y + 0.5, w: 5.65, h: 2.05, fontFace: BODY, fontSize: 10.5, color: C.ink, valign: 'top', paraSpaceAfter: 3 },
      );
    });
  }

  // 4. Programme
  {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Programme');
    const ms = d.milestones.filter((m) => m.targetDate || m.actualDate).slice(0, 12);
    if (ms.length) {
      const statusText: Record<string, string> = { COMPLETED: 'Complete', COMPLETED_LATE: 'Complete (late)', ON_TRACK: 'On track', SLIPPED: 'Slipped', OVERDUE: 'Overdue', NOT_SCHEDULED: 'Not scheduled' };
      const rows = [
        [th('MILESTONE'), th('BASELINE'), th('FORECAST'), th('ACTUAL'), th('VAR.'), th('STATUS')],
        ...ms.map((m) => [
          m.name,
          fmtDate(m.baselineDate),
          fmtDate(m.targetDate),
          fmtDate(m.actualDate),
          m.varianceDays == null ? '—' : `${m.varianceDays > 0 ? '+' : ''}${m.varianceDays} d`,
          { text: statusText[m.status] ?? m.status, options: { color: m.status === 'OVERDUE' || m.status === 'SLIPPED' ? C.red : m.status.startsWith('COMPLETED') ? C.mid : C.ink, bold: true } },
        ]),
      ];
      s.addTable(rows as TableRow[], { x: 0.5, y: 1.5, w: 7.6, colW: [2.6, 1.0, 1.0, 1.0, 0.8, 1.2], ...tableStyle, rowH: 0.32 });
    } else {
      s.addText('No milestones on the platform yet.', { x: 0.5, y: 1.6, w: 7.6, h: 0.4, fontFace: BODY, fontSize: 12, color: C.muted });
    }
    s.addShape(pptx.ShapeType.rect, { x: 8.4, y: 1.5, w: 4.4, h: 5.4, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
    s.addText('BEHIND PROGRAMME', { x: 8.6, y: 1.6, w: 4, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.red, charSpacing: 1 });
    s.addText(
      d.programme.behind.length
        ? d.programme.behind.slice(0, 8).map((a) => ({ text: `${a.name} — ${a.percentComplete}%, due ${fmtDate(a.endDate)}`, options: { bullet: { indent: 12 }, breakLine: true } }))
        : [{ text: 'Nothing is past its finish date.', options: {} }],
      { x: 8.6, y: 2.0, w: 4.0, h: 2.3, fontFace: BODY, fontSize: 10, color: C.ink, valign: 'top' },
    );
    s.addText('NEXT FOUR WEEKS', { x: 8.6, y: 4.35, w: 4, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.gold, charSpacing: 1 });
    s.addText(
      d.programme.lookAhead.length
        ? d.programme.lookAhead.slice(0, 7).map((a) => ({ text: `${a.name} (${fmtDate(a.startDate)} – ${fmtDate(a.endDate)})`, options: { bullet: { indent: 12 }, breakLine: true } }))
        : [{ text: 'Nothing scheduled.', options: {} }],
      { x: 8.6, y: 4.75, w: 4.0, h: 2.05, fontFace: BODY, fontSize: 10, color: C.ink, valign: 'top' },
    );
  }

  // 5. Cost report
  const c = d.commercial;
  if (c && c.lines.length) {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Cost Report');
    const lines = c.lines.filter((l) => l.budget || l.committed || l.approvedVariations).slice(0, 12);
    const money = (n: number) => Math.round(n).toLocaleString('en-ZA');
    const rows = [
      [{ ...th('COST CODE'), options: { ...th('').options, align: 'left' } }, th('BUDGET'), th('VARIED'), th('REVISED'), th('COMMIT.'), th('FORECAST'), th('VARIANCE')],
      ...lines.map((l) => [
        { text: `${l.code ?? ''} ${l.name}`.trim(), options: { align: 'left' } },
        money(l.budget),
        money(l.approvedVariations),
        money(l.revisedBudget),
        money(l.committed),
        money(l.forecastFinal),
        { text: money(l.variance), options: { color: l.variance < 0 ? C.red : C.ink, bold: l.variance < 0 } },
      ]),
      [
        { text: 'TOTAL', options: { bold: true, align: 'left' } },
        ...[c.totals.budget, c.totals.approvedVariations, c.totals.revisedBudget, c.totals.committed, c.totals.forecastFinal].map((n) => ({ text: money(n), options: { bold: true } })),
        { text: money(c.totals.variance), options: { bold: true, color: c.totals.variance < 0 ? C.red : C.ink } },
      ],
    ];
    s.addTable(rows as TableRow[], { x: 0.5, y: 1.5, w: 8.2, colW: [2.0, 1.03, 1.03, 1.03, 1.03, 1.03, 1.05], ...tableStyle, fontSize: 9, rowH: 0.3, align: 'right' });
    s.addText(`All amounts ${c.currency}. Contingency: ${fmtMoney(c.contingency.remaining, c.currency)} remaining of ${fmtMoney(c.contingency.original, c.currency)}.`, {
      x: 0.5,
      y: 6.7,
      w: 8.2,
      h: 0.35,
      fontFace: BODY,
      fontSize: 9,
      color: C.muted,
    });
    const chartLines = lines.filter((l) => l.revisedBudget || l.forecastFinal).slice(0, 8);
    if (chartLines.length) {
      s.addChart(
        pptx.ChartType.bar,
        [
          { name: 'Revised budget', labels: chartLines.map((l) => l.code ?? l.name), values: chartLines.map((l) => Math.round(l.revisedBudget)) },
          { name: 'Forecast final', labels: chartLines.map((l) => l.code ?? l.name), values: chartLines.map((l) => Math.round(l.forecastFinal)) },
        ],
        { x: 8.9, y: 1.5, w: 4.0, h: 5.1, barDir: 'bar', chartColors: [C.mid, C.gold], showLegend: true, legendPos: 'b', legendFontSize: 9, catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, valAxisLabelFormatCode: '#,##0' },
      );
    }
  }

  // 6. Variations
  if (d.variations.length) {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Variations');
    const statusText: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'With the client', APPROVED: 'Approved', REJECTED: 'Rejected' };
    const rows = [
      [th('NO.'), th('VARIATION'), th('VALUE'), th('TIME'), th('STATUS'), th('DECIDED')],
      ...d.variations.slice(0, 14).map((v) => [
        v.number,
        v.title,
        { text: fmtMoney(v.assessedValue ?? v.estimatedValue, d.project.currency), options: { align: 'right' as const } },
        v.timeImpactDays ? `${v.timeImpactDays} d` : '—',
        v.decisionOutcome ? OUTCOME_LABEL[v.decisionOutcome] : (statusText[v.status] ?? v.status),
        fmtDate(v.decidedAt),
      ]),
    ];
    s.addTable(rows as TableRow[], { x: 0.5, y: 1.5, w: 12.3, colW: [0.9, 5.2, 1.8, 0.9, 2.0, 1.5], ...tableStyle, rowH: 0.32 });
  }

  // 7. Critical risks
  if (d.risks.length || d.issues.length) {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Critical Risks');
    const sev = (score: number) => (score >= 15 ? { text: 'HIGH', fill: C.red } : score >= 8 ? { text: 'MEDIUM', fill: C.gold } : { text: 'LOW', fill: C.mid });
    const rows = [
      [th('SEV.'), th('AREA'), th('RISK'), th('MITIGATION'), th('OWNER')],
      ...d.risks.slice(0, 8).map((r) => {
        const v = sev(r.score);
        return [{ text: v.text, options: { bold: true, color: C.white, fill: { color: v.fill }, align: 'center' as const } }, r.category ?? '—', r.title, r.mitigation ?? '—', r.ownerName ?? '—'];
      }),
      ...d.issues
        .filter((i) => i.priority === 'HIGH' || i.priority === 'CRITICAL')
        .slice(0, 4)
        .map((i) => [{ text: 'ISSUE', options: { bold: true, color: C.white, fill: { color: C.green2 }, align: 'center' as const } }, 'Issue', i.title, i.impact ?? '—', i.ownerName ?? '—']),
    ];
    s.addTable(rows as TableRow[], { x: 0.5, y: 1.5, w: 12.3, colW: [0.9, 1.6, 4.4, 4.0, 1.4], ...tableStyle, fontSize: 9.5, rowH: 0.42 });
  }

  // 8. Decisions
  if (d.waiting.length || d.decisions.length) {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Decisions');
    s.addText('REQUIRED FROM THE CLIENT', { x: 0.5, y: 1.45, w: 6, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.red, charSpacing: 1 });
    s.addTable(
      [
        [th('ITEM'), th('TYPE'), th('RESPOND BY')],
        ...(d.waiting.length ? d.waiting.slice(0, 10).map((w) => [w.title, w.kind, fmtDate(w.dueAt)]) : [['Nothing waiting', '', '']]),
      ] as TableRow[],
      { x: 0.5, y: 1.85, w: 6.0, colW: [3.5, 1.3, 1.2], ...tableStyle, fontSize: 9.5, rowH: 0.32 },
    );
    s.addText('DECIDED THIS PERIOD', { x: 6.8, y: 1.45, w: 6, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.mid, charSpacing: 1 });
    s.addTable(
      [
        [th('ITEM'), th('DECISION'), th('BY'), th('ON')],
        ...(d.decisions.length ? d.decisions.slice(0, 10).map((r) => [r.title, OUTCOME_LABEL[r.outcome], r.signerName, fmtDate(r.signedAt)]) : [['None this period', '', '', '']]),
      ] as TableRow[],
      { x: 6.8, y: 1.85, w: 6.0, colW: [2.7, 1.3, 1.1, 0.9], ...tableStyle, fontSize: 9.5, rowH: 0.32 },
    );
  }

  // 9. Site photo record
  const photos = d.photos.filter((p) => existsSync(p.path) && (p.mimeType === 'image/jpeg' || p.mimeType === 'image/png'));
  for (let i = 0; i < Math.min(photos.length, 8); i += 4) {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, 'Site Progress — Photo Record');
    photos.slice(i, i + 4).forEach((p, j) => {
      const x = 0.5 + (j % 2) * 6.25;
      const y = 1.45 + Math.floor(j / 2) * 2.85;
      const data = `${p.mimeType};base64,${readFileSync(p.path).toString('base64')}`;
      s.addImage({ data, x, y, w: 6.05, h: 2.3, sizing: { type: 'cover', w: 6.05, h: 2.3 } });
      s.addText([{ text: (p.caption ?? p.locationNote ?? 'Site photo').toUpperCase(), options: { bold: true, color: C.green, breakLine: true } }, { text: fmtDate(p.takenAt), options: { color: C.muted } }], {
        x,
        y: y + 2.32,
        w: 6.05,
        h: 0.45,
        fontFace: BODY,
        fontSize: 9.5,
      });
    });
  }

  // 10. Priority actions
  {
    const s = pptx.addSlide({ masterName: 'SETJEKA' });
    header(s, `Priority Actions — ${reportDate}`);
    const rows = [
      [th('AREA'), th('ACTION'), th('OWNER'), th('DEADLINE')],
      ...(d.actions.length
        ? d.actions.slice(0, 12).map((a) => [a.area, a.action.length > 140 ? `${a.action.slice(0, 137)}…` : a.action, a.owner, { text: fmtDate(a.dueDate), options: { color: a.dueDate && a.dueDate < d.generatedAt ? C.red : C.ink, bold: Boolean(a.dueDate && a.dueDate < d.generatedAt) } }])
        : [['—', 'No open actions on the platform.', '', '']]),
    ];
    s.addTable(rows as TableRow[], { x: 0.5, y: 1.5, w: 12.3, colW: [1.6, 7.0, 2.2, 1.5], ...tableStyle, rowH: 0.34 });
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
