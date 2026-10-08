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
      case 'OPPORTUNITY':
        put(type, (await prisma.opportunity.findMany({ where, select: { id: true, name: true } })).map((r) => ({ id: r.id, label: r.name })));
        break;
    }
  }
  return out;
}
