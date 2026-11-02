import type { CommentEntityType } from '../generated/prisma/enums.js';

/** Where a record lives in the app, so a notification or a note in someone's
 * action list opens the right page. */
export function recordLink(entityType: CommentEntityType, ids: { projectId?: string | null; opportunityId?: string | null; entityId?: string | null }): string {
  if (entityType === 'OPPORTUNITY' && ids.opportunityId) return `/opportunities/${ids.opportunityId}`;
  if (!ids.projectId) return ids.opportunityId ? `/opportunities/${ids.opportunityId}` : '/my-day';
  const p = `/projects/${ids.projectId}`;
  switch (entityType) {
    case 'TASK':
      return `${p}?tab=tasks`;
    case 'ISSUE':
      return `${p}?tab=issues`;
    case 'RISK':
      return `${p}?tab=risks`;
    case 'RFI':
    case 'SUBMITTAL':
      return `${p}?tab=technical`;
    case 'DOCUMENT_REVISION':
      return `${p}?tab=documents`;
    case 'SCHEDULE_ACTIVITY':
      return `${p}/schedule`;
    case 'PROJECT_BRIEF':
    case 'STAGE_DELIVERABLE':
      return `${p}?tab=inception`;
    case 'MEETING':
      return `${p}?tab=meetings`;
    case 'VARIATION':
      return `${p}?tab=commercial`;
    case 'PROJECT':
      return `${p}?tab=actions`;
    case 'COMMUNICATION':
      return ids.entityId ? `${p}?tab=instructions&communication=${ids.entityId}` : `${p}?tab=instructions`;
    case 'INSPECTION':
      return ids.entityId ? `${p}?tab=inspections&inspection=${ids.entityId}` : `${p}?tab=inspections`;
    case 'PUNCH_ITEM':
      return ids.entityId ? `${p}?tab=punch&item=${ids.entityId}` : `${p}?tab=punch`;
    case 'CLASH':
      return `${p}?tab=models`;
    case 'COST_PLAN':
      return ids.entityId ? `${p}?tab=commercial&ctab=bills&plan=${ids.entityId}` : `${p}?tab=commercial&ctab=bills`;
    case 'PROJECT_CONTRACT':
    case 'VALUATION':
      return `${p}?tab=commercial&ctab=contracts`;
    case 'DAYWORK':
      return `${p}?tab=measure`;
    case 'NCR':
      return ids.entityId ? `${p}?tab=ncrs&ncr=${ids.entityId}` : `${p}?tab=ncrs`;
    case 'CONSENT':
      return `${p}?tab=authorities`;
    case 'SITE_PHOTO':
      return ids.entityId ? `${p}?tab=photos&photo=${ids.entityId}` : `${p}?tab=photos`;
    default:
      return `${p}?tab=overview`;
  }
}
