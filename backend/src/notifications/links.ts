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
    case 'TEST_RESULT':
      return ids.entityId ? `${p}?tab=tests&test=${ids.entityId}` : `${p}?tab=tests`;
    case 'PLANT_ITEM':
      return ids.entityId ? `${p}?tab=plant&item=${ids.entityId}` : `${p}?tab=plant`;
    case 'SITE_DIARY':
      return `${p}?tab=diary`;
    case 'WORK_PERMIT':
      return ids.entityId ? `${p}?tab=hse&permit=${ids.entityId}` : `${p}?tab=hse&section=permits`;
    case 'HSE_INCIDENT':
      return ids.entityId ? `${p}?tab=hse&incident=${ids.entityId}` : `${p}?tab=hse`;
    case 'HANDOVER_ITEM':
      return ids.entityId ? `${p}?tab=handover&item=${ids.entityId}` : `${p}?tab=handover`;
    case 'CONTRACT_DEFECT':
      return ids.entityId ? `${p}?tab=defects&defect=${ids.entityId}` : `${p}?tab=defects`;
    case 'TIME_CLAIM':
      return ids.entityId ? `${p}?tab=eot&claim=${ids.entityId}` : `${p}?tab=eot`;
    case 'INTERFACE':
      return ids.entityId ? `${p}?tab=interfaces&interface=${ids.entityId}` : `${p}?tab=interfaces`;
    case 'HIDDEN_WORK':
      return ids.entityId ? `${p}?tab=hidden&work=${ids.entityId}` : `${p}?tab=hidden`;
    case 'HOLD_POINT':
      return ids.entityId ? `${p}?tab=tests&point=${ids.entityId}` : `${p}?tab=tests`;
    case 'CONSENT':
      return `${p}?tab=authorities`;
    case 'SITE_PHOTO':
      return ids.entityId ? `${p}?tab=photos&photo=${ids.entityId}` : `${p}?tab=photos`;
    default:
      return `${p}?tab=overview`;
  }
}
