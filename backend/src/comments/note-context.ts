import type { CommentEntityType } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { INCEPTION_DELIVERABLES } from '../inception/procsa.js';

const TYPE_LABEL: Record<CommentEntityType, string> = {
  TASK: 'Task',
  ISSUE: 'Issue',
  SCHEDULE_ACTIVITY: 'Activity',
  DOCUMENT_REVISION: 'Document',
  RISK: 'Risk',
  RFI: 'RFI',
  SUBMITTAL: 'Submittal',
  STAGE_TRANSITION: 'Stage gate',
  STAGE_DELIVERABLE: 'Stage 1 document',
  PROJECT_BRIEF: 'Project brief',
  MEETING: 'Meeting',
  VARIATION: 'Variation',
  PROJECT: 'Project',
  OPPORTUNITY: 'Opportunity',
  SITE_PHOTO: 'Site photo',
  COMMUNICATION: 'Instruction',
  INSPECTION: 'Inspection',
  CONSENT: 'Authority approval',
  PUNCH_ITEM: 'Punch item',
  CLASH: 'Clash',
  COST_PLAN: 'Bill / cost plan',
  PROJECT_CONTRACT: 'Contract',
  VALUATION: 'Valuation',
  NCR: 'NCR',
  DAYWORK: 'Daywork sheet',
  TEST_RESULT: 'Test result',
  HOLD_POINT: 'Hold point',
  INTERFACE: 'Interface',
  HIDDEN_WORK: 'Hidden work',
  TIME_CLAIM: 'Extension of time',
  CONTRACT_DEFECT: 'Defect',
  HANDOVER_ITEM: 'Handover document',
  HSE_INCIDENT: 'Incident',
  WORK_PERMIT: 'Permit to work',
};

/** Human labels for the records notes are attached to, e.g.
 * "RFI RFI-2026-0004 · Window frame colour", resolved in one query per type. */
export async function describeRecords(prisma: PrismaService, refs: { entityType: CommentEntityType; entityId: string }[]): Promise<Map<string, string>> {
  const byType = new Map<CommentEntityType, string[]>();
  for (const r of refs) byType.set(r.entityType, [...(byType.get(r.entityType) ?? []), r.entityId]);
  const out = new Map<string, string>();
  const put = (type: CommentEntityType, rows: { id: string; label: string }[]) => {
    for (const r of rows) out.set(`${type}:${r.id}`, `${TYPE_LABEL[type]} · ${r.label}`);
  };

  for (const [type, ids] of byType) {
    const where = { id: { in: ids } };
    switch (type) {
      case 'TASK':
        put(type, (await prisma.projectTask.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
        break;
      case 'ISSUE':
        put(type, (await prisma.projectIssue.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
        break;
      case 'RISK':
        put(type, (await prisma.projectRisk.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
        break;
      case 'RFI':
        put(type, (await prisma.rfi.findMany({ where, select: { id: true, rfiNumber: true, title: true } })).map((r) => ({ id: r.id, label: `${r.rfiNumber} ${r.title}` })));
        break;
      case 'SUBMITTAL':
        put(type, (await prisma.submittal.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
        break;
      case 'SCHEDULE_ACTIVITY':
        put(type, (await prisma.scheduleActivity.findMany({ where, select: { id: true, name: true } })).map((r) => ({ id: r.id, label: r.name })));
        break;
      case 'DOCUMENT_REVISION':
        put(type, (await prisma.documentRevision.findMany({ where, select: { id: true, document: { select: { name: true } } } })).map((r) => ({ id: r.id, label: r.document.name })));
        break;
      case 'MEETING':
        put(type, (await prisma.meeting.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
        break;
      case 'VARIATION':
        put(type, (await prisma.variation.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'STAGE_DELIVERABLE':
        put(type, (await prisma.stageDeliverable.findMany({ where, select: { id: true, key: true } })).map((r) => ({ id: r.id, label: INCEPTION_DELIVERABLES.find((d) => d.key === r.key)?.title ?? r.key })));
        break;
      case 'STAGE_TRANSITION':
        put(type, (await prisma.stageTransition.findMany({ where, select: { id: true, toStage: true } })).map((r) => ({ id: r.id, label: `to ${r.toStage}` })));
        break;
      case 'PROJECT':
        // General project notes: the project name is shown alongside already.
        for (const id of ids) out.set(`${type}:${id}`, 'Project notes');
        break;
      case 'PROJECT_BRIEF':
        for (const id of ids) out.set(`${type}:${id}`, 'Project brief');
        break;
      case 'SITE_PHOTO':
        put(type, (await prisma.sitePhoto.findMany({ where, select: { id: true, caption: true, originalFilename: true } })).map((r) => ({ id: r.id, label: r.caption ?? r.originalFilename })));
        break;
      case 'COMMUNICATION':
        put(type, (await prisma.projectCommunication.findMany({ where, select: { id: true, number: true, subject: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.subject}` })));
        break;
      case 'INSPECTION':
        put(type, (await prisma.siteInspection.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'CONSENT':
        put(type, (await prisma.consentApproval.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
        break;
      case 'PUNCH_ITEM':
        put(type, (await prisma.punchItem.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'CLASH':
        put(type, (await prisma.clash.findMany({ where, select: { id: true, aName: true, bName: true, aType: true, bType: true } })).map((r) => ({ id: r.id, label: `${r.aName ?? r.aType} / ${r.bName ?? r.bType}` })));
        break;
      case 'COST_PLAN':
        put(type, (await prisma.costPlan.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'PROJECT_CONTRACT':
        put(type, (await prisma.projectContract.findMany({ where, select: { id: true, title: true, contractor: { select: { name: true } } } })).map((r) => ({ id: r.id, label: `${r.title} · ${r.contractor.name}` })));
        break;
      case 'VALUATION':
        put(type, (await prisma.valuation.findMany({ where, select: { id: true, number: true, contract: { select: { title: true } } } })).map((r) => ({ id: r.id, label: `No. ${r.number} · ${r.contract.title}` })));
        break;
      case 'DAYWORK':
        put(type, (await prisma.dayworkSheet.findMany({ where, select: { id: true, number: true, description: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.description.slice(0, 60)}` })));
        break;
      case 'INTERFACE':
        put(type, (await prisma.projectInterface.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'HIDDEN_WORK':
        put(type, (await prisma.hiddenWork.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'WORK_PERMIT':
        put(type, (await prisma.workPermit.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'HSE_INCIDENT':
        put(type, (await prisma.hseIncident.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'HANDOVER_ITEM':
        put(type, (await prisma.handoverItem.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'CONTRACT_DEFECT':
        put(type, (await prisma.contractDefect.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'TIME_CLAIM':
        put(type, (await prisma.timeClaim.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'TEST_RESULT':
        put(type, (await prisma.testResult.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'HOLD_POINT':
        put(type, (await prisma.holdPoint.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'NCR':
        put(type, (await prisma.nonConformance.findMany({ where, select: { id: true, number: true, title: true } })).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` })));
        break;
      case 'OPPORTUNITY':
        put(type, (await prisma.opportunity.findMany({ where, select: { id: true, name: true } })).map((r) => ({ id: r.id, label: r.name })));
        break;
    }
  }
  return out;
}
