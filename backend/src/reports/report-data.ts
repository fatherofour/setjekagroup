import { join } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CommercialService } from '../commercial/commercial.service.js';
import type { ProcsaService } from '../delivery/procsa.service.js';
import { milestoneStatus } from '../opportunities/milestones.js';
import { INCEPTION_DELIVERABLES } from '../inception/procsa.js';
import { REGISTER_BY_KEY } from '../delivery/registers.js';
import { photoRootDir } from '../site-photos/upload.util.js';

export const STAGE_LABEL: Record<string, string> = {
  INITIATION: 'Stage 0 · Initiation',
  INCEPTION: 'Stage 1 · Inception',
  CONCEPT: 'Stage 2 · Concept & Viability',
  DESIGN: 'Stage 3 · Design Development',
  DOCUMENTATION_PROCUREMENT: 'Stage 4 · Documentation & Procurement',
  CONSTRUCTION: 'Stage 5 · Construction',
  CLOSEOUT: 'Stage 6 · Close-out',
};

const DAY = 86_400_000;
const person = (m: { user: { fullName: string } | null; externalName: string | null } | null | undefined) => m?.user?.fullName ?? m?.externalName ?? null;

/** Everything a report draws on, loaded once. All three formats (PowerPoint,
 * PDF, Excel) read from this, so they always agree. */
export async function loadReportData(
  prisma: PrismaService,
  commercial: CommercialService,
  procsa: ProcsaService,
  projectId: string,
  userId: string,
  period: { start: Date; end: Date },
  options: { clientFacing: boolean },
) {
  const now = new Date();
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true, stage: true, status: true, client: true, location: true, currency: true, value: true, startDate: true, endDate: true },
  });
  const inPeriod = { gte: period.start, lte: period.end };

  const [
    activities,
    baselines,
    milestones,
    variations,
    risks,
    issues,
    rfis,
    submittals,
    deliverables,
    gate,
    docApprovals,
    records,
    noteActions,
    tasks,
    photos,
    weather,
    documents,
    members,
    entries,
    meetings,
  ] = await Promise.all([
    prisma.scheduleActivity.findMany({
      where: { projectId },
      select: { id: true, name: true, activityType: true, startDate: true, endDate: true, durationDays: true, percentComplete: true, status: true, isCriticalPath: true, totalFloatDays: true, contractor: { select: { name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }],
    }),
    prisma.scheduleBaseline.count({ where: { projectId } }),
    prisma.developmentMilestone.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.variation.findMany({ where: { projectId, status: { not: 'WITHDRAWN' } }, orderBy: { createdAt: 'asc' } }),
    prisma.projectRisk.findMany({ where: { projectId, status: { not: 'CLOSED' } }, include: { owner: { select: { externalName: true, user: { select: { fullName: true } } } } } }),
    prisma.projectIssue.findMany({ where: { projectId, status: { notIn: ['RESOLVED', 'CLOSED'] } }, include: { owner: { select: { externalName: true, user: { select: { fullName: true } } } } }, orderBy: { createdAt: 'asc' } }),
    prisma.rfi.findMany({ where: { projectId }, select: { rfiNumber: true, title: true, status: true, dueDate: true, createdAt: true } }),
    prisma.submittal.findMany({ where: { projectId }, select: { title: true, status: true, dueDate: true, createdAt: true } }),
    prisma.stageDeliverable.findMany({ where: { projectId, status: 'SUBMITTED' }, select: { key: true, version: true, responseDueAt: true } }),
    prisma.stageTransition.findFirst({ where: { projectId, status: 'PENDING' }, select: { fromStage: true, toStage: true, responseDueAt: true } }),
    prisma.documentApprovalRequest.findMany({ where: { projectId, status: 'PENDING' }, select: { responseDueAt: true, revision: { select: { revisionNumber: true, document: { select: { name: true } } } } } }),
    prisma.approvalRecord.findMany({ where: { projectId, signedAt: inPeriod }, orderBy: { signedAt: 'asc' }, select: { title: true, outcome: true, signerName: true, signedAt: true, comment: true } }),
    prisma.comment.findMany({
      where: { projectId, isAction: true, actionStatus: 'OPEN' },
      include: { recipient: { select: { fullName: true } } },
      orderBy: { dueDate: 'asc' },
      take: 40,
    }),
    prisma.projectTask.findMany({
      where: { projectId, status: { not: 'DONE' } },
      include: { assignedTo: { select: { externalName: true, user: { select: { fullName: true } } } } },
      orderBy: { dueDate: 'asc' },
      take: 40,
    }),
    prisma.sitePhoto.findMany({
      where: { projectId, ...(options.clientFacing ? { clientVisible: true } : {}) },
      orderBy: { takenAt: 'desc' },
      take: 40,
      select: { id: true, caption: true, takenAt: true, locationNote: true, storedFilename: true, mimeType: true, clientVisible: true },
    }),
    prisma.siteWeatherDay.findMany({ where: { projectId, date: inPeriod }, orderBy: { date: 'asc' } }),
    prisma.projectDocument.findMany({
      where: { deletedAt: null, projectId },
      select: { name: true, documentType: true, discipline: true, clientVisible: true, revisions: { orderBy: { uploadedAt: 'desc' }, take: 1, select: { revisionNumber: true, reviewStatus: true, uploadedAt: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.projectMember.findMany({ where: { projectId, role: { in: ['DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'] } }, select: { role: true, externalName: true, user: { select: { fullName: true } } } }),
    prisma.projectRegisterEntry.findMany({ where: { projectId }, include: { contractor: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.meeting.findMany({ where: { projectId, scheduledAt: inPeriod, status: { not: 'CANCELLED' } }, select: { title: true, meetingType: true, scheduledAt: true, minutesIssuedAt: true } }),
  ]);

  // Programme progress, weighted by duration (the same as the client portal).
  const taskActs = activities.filter((a) => a.activityType === 'TASK');
  const weight = taskActs.reduce((s, a) => s + Math.max(a.durationDays, 1), 0);
  const percent = weight ? Math.round(taskActs.reduce((s, a) => s + Math.max(a.durationDays, 1) * a.percentComplete, 0) / weight) : null;
  const behind = taskActs.filter((a) => a.endDate.getTime() < now.getTime() && a.percentComplete < 100);
  const lookAhead = activities.filter((a) => a.percentComplete < 100 && a.startDate.getTime() <= now.getTime() + 28 * DAY).slice(0, 10);
  const finish = activities.length ? activities.reduce((m, a) => (a.endDate > m ? a.endDate : m), activities[0].endDate) : null;

  const ms = milestones.map((m) => ({ name: m.name, baselineDate: m.baselineDate, targetDate: m.targetDate, actualDate: m.actualDate, ...milestoneStatus(m) }));

  let summary: Awaited<ReturnType<CommercialService['summary']>> | null = null;
  try {
    summary = await commercial.summary(projectId);
  } catch {
    summary = null;
  }

  let tracker: Awaited<ReturnType<ProcsaService['tracker']>> | null = null;
  try {
    tracker = await procsa.tracker(projectId, userId);
  } catch {
    tracker = null;
  }

  // The QS's contracts and payment certificates (2026-10-28), and the
  // non-conformance reports (2026-10-29).
  const [contractRows, valuationRows, ncrRows] = await Promise.all([
    prisma.projectContract.findMany({ where: { projectId }, include: { contractor: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.valuation.findMany({ where: { projectId }, orderBy: [{ contractId: 'asc' }, { number: 'asc' }], include: { contract: { select: { title: true, currency: true, contractor: { select: { name: true } } } } } }),
    prisma.nonConformance.findMany({
      where: { projectId, status: { not: 'VOID' } },
      orderBy: { sequence: 'asc' },
      select: { number: true, title: true, kind: true, severity: true, status: true, location: true, dueDate: true, createdAt: true, closedAt: true, raisedBy: { select: { fullName: true } }, assignee: { select: { externalName: true, user: { select: { fullName: true } } } } },
    }),
  ]);
  const ncrs = ncrRows.map((n) => ({ ...n, raisedBy: n.raisedBy.fullName, assignee: n.assignee?.user?.fullName ?? n.assignee?.externalName ?? null }));
  const CERTIFIED = ['CERTIFIED', 'APPROVED', 'PAID'];
  const contracts = contractRows.map((c) => {
    const vals = valuationRows.filter((v) => v.contractId === c.id);
    const last = [...vals].reverse().find((v) => CERTIFIED.includes(v.status));
    return {
      title: c.title,
      contractor: c.contractor.name,
      currency: c.currency,
      contractSum: c.contractSum,
      approvedVariations: variations.filter((v) => v.contractId === c.id && v.status === 'APPROVED').reduce((s, v) => s + (v.assessedValue ?? v.estimatedValue), 0),
      certifiedNet: last?.cumulativeNet ?? 0,
      retentionHeld: last?.retention ?? 0,
      paid: vals.filter((v) => v.status === 'PAID').reduce((s, v) => s + v.amountDue, 0),
      lastCertificate: last ? { number: last.certificateNumber, status: last.status, amountDue: last.amountDue, certifiedAt: last.certifiedAt } : null,
      finalAccountStatus: c.finalAccountStatus,
    };
  });
  const certificates = valuationRows
    .filter((v) => v.certificateNumber)
    .map((v) => ({
      number: v.certificateNumber!,
      contract: v.contract.title,
      contractor: v.contract.contractor.name,
      currency: v.contract.currency,
      valuationDate: v.valuationDate,
      grossValuation: v.grossValuation,
      retention: v.retention,
      netDue: v.netDue,
      vat: v.vat,
      amountDue: v.amountDue,
      status: v.status,
      isFinal: v.isFinal,
      certifiedAt: v.certifiedAt,
      paidAt: v.paidAt,
    }));

  const score = (r: { probability: number; impact: number }) => r.probability * r.impact;
  const sortedRisks = [...risks].sort((a, b) => score(b) - score(a));
  const waiting = [
    ...(gate ? [{ title: `Move from ${STAGE_LABEL[gate.fromStage]} to ${STAGE_LABEL[gate.toStage]}`, kind: 'Stage gate', dueAt: gate.responseDueAt }] : []),
    ...deliverables.map((d) => ({ title: `${INCEPTION_DELIVERABLES.find((x) => x.key === d.key)?.title ?? d.key} (v${d.version})`, kind: 'Stage 1 document', dueAt: d.responseDueAt })),
    ...variations.filter((v) => v.status === 'SUBMITTED').map((v) => ({ title: `Variation ${v.number}: ${v.title}`, kind: 'Variation', dueAt: v.responseDueAt })),
    ...docApprovals.map((r) => ({ title: `${r.revision.document.name} (Rev ${r.revision.revisionNumber})`, kind: 'Document', dueAt: r.responseDueAt })),
    ...valuationRows.filter((v) => v.status === 'CERTIFIED').map((v) => ({ title: `Payment certificate ${v.certificateNumber}: ${v.contract.contractor.name}`, kind: 'Payment certificate', dueAt: v.responseDueAt })),
  ];

  const actions = [
    ...noteActions.map((a) => ({ action: a.body, owner: a.recipient?.fullName ?? '—', dueDate: a.dueDate, area: a.entityType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) })),
    ...tasks.map((t) => ({ action: t.title, owner: person(t.assignedTo) ?? '—', dueDate: t.dueDate, area: 'Task' })),
  ].sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

  const periodPhotos = photos.filter((p) => p.takenAt >= period.start && p.takenAt <= period.end);
  const chosenPhotos = (periodPhotos.length ? periodPhotos : photos).slice(0, 8).map((p) => ({ ...p, path: join(photoRootDir(), p.storedFilename) }));

  const register = (key: string) => {
    const def = REGISTER_BY_KEY.get(key)!;
    const label = (column: string, value: string | null) => (value ? (def.fields.find((f) => f.column === column)?.options?.[value] ?? value) : null);
    return entries
      .filter((e) => e.register === key)
      .map((e) => ({ ...e, categoryLabel: label('category', e.category), statusLabel: label('status', e.status), contractorName: e.contractor?.name ?? null }));
  };

  return {
    generatedAt: now,
    period,
    project: { ...project, stageLabel: STAGE_LABEL[project.stage] ?? project.stage },
    team: {
      developmentManager: members.filter((m) => m.role === 'DEVELOPMENT_MANAGER').map(person).filter(Boolean) as string[],
      projectManager: members.filter((m) => m.role === 'PROJECT_MANAGER').map(person).filter(Boolean) as string[],
      quantitySurveyor: members.filter((m) => m.role === 'QUANTITY_SURVEYOR').map(person).filter(Boolean) as string[],
    },
    programme: { percent, activities, behind, lookAhead, finish, baselines, critical: activities.filter((a) => a.isCriticalPath).length },
    milestones: ms,
    commercial: summary,
    variations,
    contracts,
    certificates,
    ncrs,
    risks: sortedRisks.map((r) => ({ ...r, score: score(r), ownerName: person(r.owner) })),
    issues: issues.map((i) => ({ ...i, ownerName: person(i.owner) })),
    rfis,
    submittals,
    waiting,
    decisions: records,
    actions,
    photos: chosenPhotos,
    weather: {
      days: weather,
      rainDays: weather.filter((d) => (d.precipitationMm ?? 0) >= 1).length,
      totalRainMm: Math.round(weather.reduce((s, d) => s + (d.precipitationMm ?? 0), 0)),
      hottest: weather.reduce((m, d) => Math.max(m, d.tempMaxC ?? -99), -99),
    },
    documents: documents.map((d) => ({ name: d.name, documentType: d.documentType, discipline: d.discipline, clientVisible: d.clientVisible, revision: d.revisions[0] ?? null })),
    meetings,
    procsa: tracker ? { done: tracker.done, total: tracker.total, stages: tracker.stages.map((s) => ({ number: s.number, label: s.label, done: s.done, total: s.total })) } : null,
    registers: {
      certificates: register('certificates'),
      defects: register('defects'),
      handover: register('handover-documents'),
      finalAccounts: register('final-accounts'),
      claims: register('claims'),
      paymentCertificates: register('payment-certificates'),
      insurances: register('insurances'),
    },
  };
}

export type ReportData = Awaited<ReturnType<typeof loadReportData>>;

export const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : '—');
export const fmtMoney = (n: number | null | undefined, currency: string) =>
  n == null ? '—' : `${currency} ${Math.round(n).toLocaleString('en-ZA')}`;
