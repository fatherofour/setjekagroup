import { OUTCOME_LABEL } from '../signoff/dto/decision.dto.js';
import { fmtDate, fmtMoney, type ReportData } from './report-data.js';

export type Rag = 'GREEN' | 'AMBER' | 'RED' | 'GREY';

export interface StatusCard {
  area: string;
  rag: Rag;
  label: string;
  lines: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The status cards on the executive summary: programme, commercial,
 * decisions and risks, each with a traffic-light label, as in Setjeka's
 * own weekly report. */
export function statusCards(d: ReportData): StatusCard[] {
  const cards: StatusCard[] = [];
  const p = d.programme;
  if (p.activities.length) {
    const late = d.milestones.filter((m) => m.status === 'OVERDUE' || m.status === 'SLIPPED');
    const rag: Rag = p.behind.length > 3 || late.some((m) => m.status === 'OVERDUE') ? 'RED' : p.behind.length || late.length ? 'AMBER' : 'GREEN';
    cards.push({
      area: 'Programme',
      rag,
      label: rag === 'GREEN' ? 'ON PROGRAMME' : 'BEHIND PROGRAMME',
      lines: [
        `${p.percent ?? 0}% complete across ${plural(p.activities.length, 'activity', 'activities')}${p.finish ? `, finishing ${fmtDate(p.finish)}` : ''}.`,
        p.behind.length ? p.behind.length === 1 ? '1 activity is past its finish date and not complete.' : `${p.behind.length} activities are past their finish date and not complete.` : 'No activity is past its finish date.',
        ...(late.length ? [`${plural(late.length, 'milestone')} slipped or overdue: ${late.slice(0, 3).map((m) => m.name).join('; ')}.`] : []),
      ],
    });
  } else {
    cards.push({ area: 'Programme', rag: 'GREY', label: 'NOT YET PROGRAMMED', lines: ['No programme on the platform yet.'] });
  }

  const c = d.commercial;
  if (c && (c.totals.budget > 0 || c.totals.committed > 0)) {
    const over = c.totals.variance < 0;
    const lowContingency = c.contingency.original > 0 && c.contingency.remaining < c.contingency.original * 0.25;
    const rag: Rag = over ? 'RED' : lowContingency || c.contingency.pendingExposure > 0 ? 'AMBER' : 'GREEN';
    cards.push({
      area: 'Commercial',
      rag,
      label: over ? 'OVER BUDGET' : 'WITHIN BUDGET',
      lines: [
        `Forecast final ${fmtMoney(c.totals.forecastFinal, c.currency)} against a revised budget of ${fmtMoney(c.totals.revisedBudget, c.currency)}${over ? `, ${fmtMoney(-c.totals.variance, c.currency)} over` : ''}.`,
        `Contingency ${fmtMoney(c.contingency.remaining, c.currency)} remaining of ${fmtMoney(c.contingency.original, c.currency)}${c.contingency.pendingExposure ? `; ${fmtMoney(c.contingency.pendingExposure, c.currency)} more if pending variations are approved` : ''}.`,
        ...(c.budgetLocked ? [] : ['The budget is not yet locked as the approved baseline.']),
      ],
    });
  } else {
    cards.push({ area: 'Commercial', rag: 'GREY', label: 'NO BUDGET YET', lines: ['No budget has been set on the platform.'] });
  }

  const overdue = d.waiting.filter((w) => w.dueAt && w.dueAt < d.generatedAt);
  cards.push({
    area: 'Decisions',
    rag: overdue.length ? 'RED' : d.waiting.length ? 'AMBER' : 'GREEN',
    label: d.waiting.length ? 'CLIENT DECISION REQUIRED' : 'NOTHING WAITING',
    lines: d.waiting.length
      ? [
          `${plural(d.waiting.length, 'item')} waiting for the client's decision${overdue.length ? `, ${overdue.length} past the response date` : ''}.`,
          ...d.waiting.slice(0, 3).map((w) => `${w.title}${w.dueAt ? ` (by ${fmtDate(w.dueAt)})` : ''}`),
        ]
      : ['No decisions are waiting on the client.'],
  });

  const high = d.risks.filter((r) => r.score >= 15);
  cards.push({
    area: 'Risks & issues',
    rag: high.length ? 'RED' : d.risks.length || d.issues.length ? 'AMBER' : 'GREEN',
    label: high.length ? 'HIGH RISKS OPEN' : 'UNDER CONTROL',
    lines: [
      `${plural(d.risks.length, 'open risk')}${high.length ? `, ${high.length} rated high` : ''}; ${plural(d.issues.length, 'open issue')}.`,
      ...high.slice(0, 2).map((r) => `${r.title}${r.mitigation ? ` — ${r.mitigation}` : ''}`),
    ],
  });
  return cards;
}

/** What happened in the period, in sentences. */
export function thisPeriod(d: ReportData): string[] {
  const out: string[] = [];
  const achieved = d.milestones.filter((m) => m.actualDate && m.actualDate >= d.period.start && m.actualDate <= d.period.end);
  for (const m of achieved) out.push(`${m.name} achieved on ${fmtDate(m.actualDate)}.`);
  for (const r of d.decisions.slice(0, 6)) out.push(`${r.title}: ${OUTCOME_LABEL[r.outcome].toLowerCase()} by ${r.signerName} on ${fmtDate(r.signedAt)}.`);
  const meetings = d.meetings.filter((m) => m.minutesIssuedAt);
  if (meetings.length) out.push(`${plural(meetings.length, 'meeting')} held with minutes issued: ${meetings.map((m) => m.title).slice(0, 3).join('; ')}.`);
  const rfisRaised = d.rfis.filter((r) => r.createdAt >= d.period.start && r.createdAt <= d.period.end).length;
  if (rfisRaised) out.push(`${plural(rfisRaised, 'RFI')} raised.`);
  if (d.weather.days.length) out.push(`Site weather: ${plural(d.weather.rainDays, 'day')} of rain (${d.weather.totalRainMm} mm in total) over ${plural(d.weather.days.length, 'recorded day')}.`);
  if (!out.length) out.push('No milestones, decisions or meetings were recorded on the platform in this period.');
  return out;
}

/** What's coming, in sentences. */
export function nextPeriod(d: ReportData): string[] {
  const out: string[] = [];
  const soon = d.milestones.filter((m) => !m.actualDate && m.targetDate && m.targetDate.getTime() < d.generatedAt.getTime() + 30 * 86_400_000);
  for (const m of soon.slice(0, 4)) out.push(`${m.name} due ${fmtDate(m.targetDate)}${m.status === 'OVERDUE' ? ' (overdue)' : ''}.`);
  for (const a of d.programme.lookAhead.slice(0, 4)) out.push(`${a.name}: ${a.percentComplete}% complete, finishing ${fmtDate(a.endDate)}.`);
  for (const w of d.waiting.slice(0, 3)) out.push(`Client decision: ${w.title}${w.dueAt ? ` by ${fmtDate(w.dueAt)}` : ''}.`);
  if (!out.length) out.push('Nothing scheduled on the platform for the coming weeks.');
  return out;
}

export function periodLabel(d: ReportData) {
  return `${fmtDate(d.period.start)} – ${fmtDate(d.period.end)}`;
}
