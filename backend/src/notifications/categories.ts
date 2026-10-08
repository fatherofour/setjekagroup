import type { NotificationType } from '../generated/prisma/enums.js';

/** How alerts are grouped on the Notifications page and in each person's
 * alert settings. Keep in step with frontend lib/notifications.ts. */
export type AlertCategory = 'APPROVALS' | 'ACTIONS' | 'ASSIGNMENTS' | 'DEADLINES' | 'MEETINGS' | 'SITE';

export const ALERT_CATEGORIES: AlertCategory[] = ['APPROVALS', 'ACTIONS', 'ASSIGNMENTS', 'DEADLINES', 'MEETINGS', 'SITE'];

// Decisions waiting on someone (the client's sign-offs above all) must
// always reach them, so this category can't be switched off.
export const UNMUTABLE: AlertCategory[] = ['APPROVALS'];

const CATEGORY: Record<NotificationType, AlertCategory> = {
  STAGE_TRANSITION_REQUESTED: 'APPROVALS',
  STAGE_TRANSITION_DECIDED: 'APPROVALS',
  DELIVERABLE_SUBMITTED: 'APPROVALS',
  DELIVERABLE_DECIDED: 'APPROVALS',
  VARIATION_SUBMITTED: 'APPROVALS',
  VARIATION_DECIDED: 'APPROVALS',
  SUBMITTAL_STATUS_CHANGED: 'APPROVALS',
  RFI_BALL_IN_COURT: 'APPROVALS',
  NOTE_FOR_YOU: 'ACTIONS',
  ACTION_ASSIGNED: 'ACTIONS',
  ACTION_COMPLETED: 'ACTIONS',
  MENTIONED: 'ACTIONS',
  TASK_ASSIGNED: 'ASSIGNMENTS',
  ISSUE_ASSIGNED: 'ASSIGNMENTS',
  RISK_ESCALATED: 'ASSIGNMENTS',
  DUE_SOON: 'DEADLINES',
  MEETING_SCHEDULED: 'MEETINGS',
  PHOTO_ADDED: 'SITE',
  PHOTOS_SHARED: 'SITE',
};

export function categoryOf(type: NotificationType): AlertCategory {
  return CATEGORY[type];
}

export function typesIn(category: AlertCategory): NotificationType[] {
  return (Object.keys(CATEGORY) as NotificationType[]).filter((t) => CATEGORY[t] === category);
}
