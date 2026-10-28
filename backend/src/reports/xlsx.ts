import ExcelJS from 'exceljs';
import { OUTCOME_LABEL } from '../signoff/dto/decision.dto.js';
import type { ReportData } from './report-data.js';

const GREEN = 'FF173A29';
const CREAM = 'FFFAF8F2';

type Col = { header: string; key: string; width: number; type?: 'date' | 'money' | 'int' | 'pct' };

/** Excel (Meeting 3 §2.9): the programme and everything tabular, one sheet
 * each, with a frozen, filterable header row in the Setjeka green. */
export async function workbook(d: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Setjeka Group';
  wb.created = d.generatedAt;
  const cur = d.commercial?.currency ?? d.project.currency;
  const moneyFmt = `"${cur} "#,##0.00;[Red]-"${cur} "#,##0.00`;

  const sheet = (name: string, cols: Col[], rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    head.alignment = { vertical: 'middle' };
    head.height = 20;
    for (const r of rows) ws.addRow(r);
    cols.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.type === 'date') col.numFmt = 'dd mmm yyyy';
      if (c.type === 'money') col.numFmt = moneyFmt;
      if (c.type === 'int') col.numFmt = '0';
      if (c.type === 'pct') col.numFmt = '0"%"';
    });
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };

  // Summary sheet first.
  const s = wb.addWorksheet('Summary');
  s.columns = [{ width: 32 }, { width: 50 }];
  const info: [string, unknown][] = [
    ['Project', d.project.name],
    ['Code', d.project.projectCode ?? ''],
    ['Stage', d.project.stageLabel],
    ['Client', d.project.client ?? ''],
    ['Location', d.project.location ?? ''],
    ['Report period', `${d.period.start.toISOString().slice(0, 10)} to ${d.period.end.toISOString().slice(0, 10)}`],
    ['Programme complete', d.programme.percent != null ? `${d.programme.percent}%` : ''],
    ['Programmed completion', d.programme.finish ?? ''],
    ['Revised budget', d.commercial?.totals.revisedBudget ?? ''],
    ['Forecast final cost', d.commercial?.totals.forecastFinal ?? ''],
    ['Contingency remaining', d.commercial?.contingency.remaining ?? ''],
    ['Generated', d.generatedAt],
  ];
  s.addRow(['SETJEKA GROUP', '']).font = { bold: true, size: 14, color: { argb: GREEN } };
  s.addRow([]);
  for (const [k, v] of info) {
    const r = s.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    if (v instanceof Date) r.getCell(2).numFmt = 'dd mmm yyyy';
    if (typeof v === 'number') r.getCell(2).numFmt = moneyFmt;
  }
  s.getColumn(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };

  sheet(
    'Programme',
    [
      { header: 'Activity', key: 'name', width: 46 },
      { header: 'Type', key: 'type', width: 11 },
      { header: 'Start', key: 'start', width: 13, type: 'date' },
      { header: 'Finish', key: 'finish', width: 13, type: 'date' },
      { header: 'Duration (days)', key: 'duration', width: 14, type: 'int' },
      { header: '% complete', key: 'pct', width: 11, type: 'pct' },
      { header: 'Critical', key: 'critical', width: 9 },
      { header: 'Total float (days)', key: 'float', width: 15 },
      { header: 'Contractor', key: 'contractor', width: 24 },
      { header: 'Status', key: 'status', width: 13 },
    ],
    d.programme.activities.map((a) => ({
      name: a.name,
      type: a.activityType === 'MILESTONE' ? 'Milestone' : 'Task',
      start: a.startDate,
      finish: a.endDate,
      duration: a.durationDays,
      pct: a.percentComplete,
      critical: a.isCriticalPath ? 'Yes' : '',
      float: a.totalFloatDays ?? '',
      contractor: a.contractor?.name ?? '',
      status: a.status,
    })),
  );

  sheet(
    'Milestones',
    [
      { header: 'Milestone', key: 'name', width: 40 },
      { header: 'Baseline', key: 'baseline', width: 13, type: 'date' },
      { header: 'Forecast', key: 'target', width: 13, type: 'date' },
      { header: 'Actual', key: 'actual', width: 13, type: 'date' },
      { header: 'Variance (days)', key: 'variance', width: 14 },
      { header: 'Status', key: 'status', width: 16 },
    ],
    d.milestones.map((m) => ({ name: m.name, baseline: m.baselineDate, target: m.targetDate, actual: m.actualDate, variance: m.varianceDays ?? '', status: m.status.replace(/_/g, ' ').toLowerCase() })),
  );

  if (d.commercial) {
    sheet(
      'Cost report',
      [
        { header: 'Code', key: 'code', width: 8 },
        { header: 'Cost code', key: 'name', width: 32 },
        { header: 'Budget', key: 'budget', width: 16, type: 'money' },
        { header: 'Approved variations', key: 'av', width: 18, type: 'money' },
        { header: 'Pending variations', key: 'pv', width: 18, type: 'money' },
        { header: 'Revised budget', key: 'rev', width: 16, type: 'money' },
        { header: 'Committed', key: 'com', width: 16, type: 'money' },
        { header: 'Invoiced', key: 'inv', width: 16, type: 'money' },
        { header: 'Paid', key: 'paid', width: 16, type: 'money' },
        { header: 'Forecast final', key: 'ff', width: 16, type: 'money' },
        { header: 'Variance', key: 'var', width: 16, type: 'money' },
      ],
      d.commercial.lines.map((l) => ({
        code: l.code ?? '',
        name: l.name,
        budget: l.budget,
        av: l.approvedVariations,
        pv: l.pendingVariations,
        rev: l.revisedBudget,
        com: l.committed,
        inv: l.invoiced,
        paid: l.paid,
        ff: l.forecastFinal,
        var: l.variance,
      })),
    );
  }

  sheet(
    'Contracts',
    [
      { header: 'Contract', key: 'title', width: 32 },
      { header: 'Contractor', key: 'contractor', width: 26 },
      { header: 'Contract sum', key: 'sum', width: 16, type: 'money' },
      { header: 'Approved variations', key: 'vars', width: 18, type: 'money' },
      { header: 'Certified (excl. VAT)', key: 'cert', width: 18, type: 'money' },
      { header: 'Retention held', key: 'ret', width: 16, type: 'money' },
      { header: 'Paid (incl. VAT)', key: 'paid', width: 16, type: 'money' },
      { header: 'Latest certificate', key: 'last', width: 18 },
      { header: 'Final account', key: 'fa', width: 16 },
    ],
    d.contracts.map((c) => ({ title: c.title, contractor: c.contractor, sum: c.contractSum, vars: c.approvedVariations, cert: c.certifiedNet, ret: c.retentionHeld, paid: c.paid, last: c.lastCertificate?.number ?? '', fa: c.finalAccountStatus.replace(/_/g, ' ').toLowerCase() })),
  );
  sheet(
    'Valuations',
    [
      { header: 'Certificate', key: 'number', width: 12 },
      { header: 'Contract', key: 'contract', width: 30 },
      { header: 'Contractor', key: 'contractor', width: 24 },
      { header: 'Valuation date', key: 'date', width: 14, type: 'date' },
      { header: 'Gross valuation', key: 'gross', width: 16, type: 'money' },
      { header: 'Retention', key: 'ret', width: 14, type: 'money' },
      { header: 'Due excl. VAT', key: 'net', width: 16, type: 'money' },
      { header: 'VAT', key: 'vat', width: 14, type: 'money' },
      { header: 'Amount due', key: 'due', width: 16, type: 'money' },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Certified', key: 'certified', width: 13, type: 'date' },
      { header: 'Paid', key: 'paid', width: 13, type: 'date' },
    ],
    d.certificates.map((c) => ({ number: `${c.number}${c.isFinal ? ' (final)' : ''}`, contract: c.contract, contractor: c.contractor, date: c.valuationDate, gross: c.grossValuation, ret: c.retention, net: c.netDue, vat: c.vat, due: c.amountDue, status: c.status.toLowerCase(), certified: c.certifiedAt, paid: c.paidAt })),
  );

  sheet(
    'Variations',
    [
      { header: 'No.', key: 'number', width: 9 },
      { header: 'Variation', key: 'title', width: 40 },
      { header: 'Reason', key: 'reason', width: 18 },
      { header: 'Estimated', key: 'est', width: 15, type: 'money' },
      { header: 'QS assessed', key: 'ass', width: 15, type: 'money' },
      { header: 'Time (days)', key: 'days', width: 11 },
      { header: 'Status', key: 'status', width: 22 },
      { header: 'Decided', key: 'decided', width: 13, type: 'date' },
      { header: 'Comment', key: 'comment', width: 40 },
    ],
    d.variations.map((v) => ({
      number: v.number,
      title: v.title,
      reason: v.reason.replace(/_/g, ' ').toLowerCase(),
      est: v.estimatedValue,
      ass: v.assessedValue ?? '',
      days: v.timeImpactDays ?? '',
      status: v.decisionOutcome ? OUTCOME_LABEL[v.decisionOutcome] : v.status.toLowerCase(),
      decided: v.decidedAt,
      comment: v.decisionComment ?? '',
    })),
  );

  sheet(
    'Risks',
    [
      { header: 'Risk', key: 'title', width: 40 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Probability', key: 'p', width: 11 },
      { header: 'Impact', key: 'i', width: 9 },
      { header: 'Score', key: 'score', width: 8 },
      { header: 'Mitigation', key: 'mitigation', width: 44 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    d.risks.map((r) => ({ title: r.title, category: r.category ?? '', p: r.probability, i: r.impact, score: r.score, mitigation: r.mitigation ?? '', owner: r.ownerName ?? '', status: r.status })),
  );

  sheet(
    'Issues',
    [
      { header: 'Issue', key: 'title', width: 40 },
      { header: 'Priority', key: 'priority', width: 11 },
      { header: 'Impact', key: 'impact', width: 36 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Due', key: 'due', width: 13, type: 'date' },
      { header: 'Status', key: 'status', width: 12 },
    ],
    d.issues.map((i) => ({ title: i.title, priority: i.priority, impact: i.impact ?? '', owner: i.ownerName ?? '', due: i.dueDate, status: i.status })),
  );

  sheet(
    'RFIs',
    [
      { header: 'No.', key: 'no', width: 16 },
      { header: 'RFI', key: 'title', width: 44 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Due', key: 'due', width: 13, type: 'date' },
      { header: 'Raised', key: 'raised', width: 13, type: 'date' },
    ],
    d.rfis.map((r) => ({ no: r.rfiNumber, title: r.title, status: r.status, due: r.dueDate, raised: r.createdAt })),
  );

  sheet(
    'Submittals',
    [
      { header: 'Submittal', key: 'title', width: 44 },
      { header: 'Status', key: 'status', width: 24 },
      { header: 'Due', key: 'due', width: 13, type: 'date' },
    ],
    d.submittals.map((x) => ({ title: x.title, status: x.status.replace(/_/g, ' ').toLowerCase(), due: x.dueDate })),
  );

  sheet(
    'Documents',
    [
      { header: 'Document', key: 'name', width: 44 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Discipline', key: 'discipline', width: 16 },
      { header: 'Current revision', key: 'rev', width: 15 },
      { header: 'Review', key: 'review', width: 18 },
      { header: 'Uploaded', key: 'up', width: 13, type: 'date' },
      { header: 'Shared with client', key: 'client', width: 16 },
    ],
    d.documents.map((x) => ({
      name: x.name,
      type: x.documentType ?? '',
      discipline: x.discipline ?? '',
      rev: x.revision?.revisionNumber ?? '',
      review: x.revision?.reviewStatus.replace(/_/g, ' ').toLowerCase() ?? '',
      up: x.revision?.uploadedAt ?? '',
      client: x.clientVisible ? 'Yes' : '',
    })),
  );

  sheet(
    'Site weather',
    [
      { header: 'Day', key: 'date', width: 13, type: 'date' },
      { header: 'High °C', key: 'max', width: 9 },
      { header: 'Low °C', key: 'min', width: 9 },
      { header: 'Rain mm', key: 'rain', width: 9 },
      { header: 'Wind km/h', key: 'wind', width: 10 },
    ],
    d.weather.days.map((w) => ({ date: w.date, max: w.tempMaxC ?? '', min: w.tempMinC ?? '', rain: w.precipitationMm ?? '', wind: w.windMaxKmh ?? '' })),
  );

  const regSheet = (name: string, rows: ReportData['registers']['defects']) =>
    rows.length &&
    sheet(
      name,
      [
        { header: 'Reference', key: 'ref', width: 14 },
        { header: 'Title', key: 'title', width: 36 },
        { header: 'Type', key: 'cat', width: 26 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Contractor', key: 'con', width: 22 },
        { header: 'Amount', key: 'amount', width: 16, type: 'money' },
        { header: 'Date', key: 'date', width: 13, type: 'date' },
        { header: 'Due', key: 'due', width: 13, type: 'date' },
        { header: 'Completed', key: 'done', width: 13, type: 'date' },
        { header: 'Notes', key: 'notes', width: 40 },
      ],
      rows.map((r) => ({
        ref: r.reference ?? '',
        title: r.title ?? r.location ?? '',
        cat: r.categoryLabel ?? '',
        status: r.statusLabel ?? '',
        con: r.contractorName ?? '',
        amount: r.amount ?? '',
        date: r.date,
        due: r.dueDate,
        done: r.completedAt,
        notes: r.notes ?? '',
      })),
    );
  regSheet('Payment certificates', d.registers.paymentCertificates);
  regSheet('Claims', d.registers.claims);
  regSheet('Defects', d.registers.defects);
  regSheet('Handover documents', d.registers.handover);
  regSheet('Certificates', d.registers.certificates);
  regSheet('Final accounts', d.registers.finalAccounts);
  regSheet('Insurances', d.registers.insurances);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
