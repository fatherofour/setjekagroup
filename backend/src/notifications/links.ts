import type { CommentEntityType } from '../generated/prisma/enums.js';

/** Where a record lives in the app, so a notification or a note in someone's
 * action list opens the right page. */
export function recordLink(entityType: CommentEntityType, ids: { projectId?: string | null; opportunityId?: string | null }): string {
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
    default:
      return `${p}?tab=overview`;
  }
}
