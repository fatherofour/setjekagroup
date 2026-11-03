import type { NotificationType } from '../generated/prisma/enums.js';

/** How alerts are grouped on the Notifications page and in each person's
 * alert settings. Keep in step with frontend lib/notifications.ts. */
// Meetings and site photos were taken out of the alert settings at the App
// Review (17 Oct 2026): meeting invitations count as assignments, and site
// photo uploads raise no alert at all.
export type AlertCategory = 'APPROVALS' | 'ACTIONS' | 'ASSIGNMENTS' | 'DEADLINES';

export const ALERT_CATEGORIES: AlertCategory[] = ['APPROVALS', 'ACTIONS', 'ASSIGNMENTS', 'DEADLINES'];

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
  APPROVAL_DUE: 'APPROVALS',
  APPROVAL_OVERDUE: 'APPROVALS',
  DOCUMENT_APPROVAL_REQUESTED: 'APPROVALS',
  DOCUMENT_APPROVAL_DECIDED: 'APPROVALS',
  // Instructions and letters must reach the person they're addressed to,
  // like a decision does; a draft waiting for Setjeka to issue is its action.
  COMMUNICATION_RECEIVED: 'APPROVALS',
  COMMUNICATION_AWAITING_ISSUE: 'ACTIONS',
  COMMUNICATION_ANSWERED: 'ACTIONS',
  INSPECTION_REQUESTED: 'ASSIGNMENTS',
  INSPECTION_SCHEDULED: 'ASSIGNMENTS',
  INSPECTION_COMPLETED: 'ACTIONS',
  // A review the architect owes is their decision to make.
  REGISTER_REVIEW_REQUESTED: 'APPROVALS',
  REGISTER_REVIEWED: 'ACTIONS',
  PUNCH_ITEM_ASSIGNED: 'ASSIGNMENTS',
  // The contractor says it's fixed: the architect's to inspect.
  PUNCH_ITEM_READY: 'APPROVALS',
  PUNCH_ITEM_DECIDED: 'ACTIONS',
  TEXT_EXTRACTED: 'ACTIONS',
  // The QS's work (2026-10-28): a valuation waiting for the PM to certify,
  // and a certificate waiting for the client, are decisions owed.
  COST_PLAN_ISSUED: 'ACTIONS',
  VALUATION_SUBMITTED: 'APPROVALS',
  VALUATION_RETURNED: 'ACTIONS',
  PAYMENT_CERTIFICATE_ISSUED: 'APPROVALS',
  PAYMENT_CERTIFICATE_DECIDED: 'APPROVALS',
  // An RFI with a cost impact brings the QS in (Feature Register Review).
  RFI_COST_IMPACT: 'ACTIONS',
  // An NCR issued is the contractor's to answer; an answer or a fix is the
  // raiser's to decide.
  NCR_ISSUED: 'ASSIGNMENTS',
  NCR_RESPONDED: 'APPROVALS',
  NCR_READY: 'APPROVALS',
  NCR_DECIDED: 'ACTIONS',
  // Measured work: the contractor agrees each measurement; whoever measures
  // signs each daywork sheet.
  MEASUREMENT_RECORDED: 'APPROVALS',
  MEASUREMENT_DISPUTED: 'ACTIONS',
  DAYWORK_SUBMITTED: 'APPROVALS',
  DAYWORK_DECIDED: 'ACTIONS',
  // Test results to review, failures, and hold point notices to attend.
  TEST_RECORDED: 'APPROVALS',
  TEST_FAILED: 'ACTIONS',
  HOLD_POINT_NOTIFIED: 'APPROVALS',
  HOLD_POINT_DECIDED: 'ACTIONS',
  // An interface is the owner's to propose and the accepter's to agree;
  // hidden work is the inspector's to sign off before it is covered.
  INTERFACE_RAISED: 'ASSIGNMENTS',
  INTERFACE_PROPOSED: 'APPROVALS',
  INTERFACE_DECIDED: 'ACTIONS',
  HIDDEN_WORK_REQUESTED: 'APPROVALS',
  HIDDEN_WORK_DECIDED: 'ACTIONS',
  // A delay notice and a claim are the PM's to deal with; the assessment
  // and the contractor's answer go back the other way.
  TIME_CLAIM_NOTIFIED: 'ACTIONS',
  TIME_CLAIM_SUBMITTED: 'APPROVALS',
  TIME_CLAIM_DECIDED: 'ACTIONS',
  TIME_CLAIM_RESPONDED: 'ACTIONS',
  // Completion certificates are news; a defect is the contractor's to put
  // right and the consultant's to verify; a client's report is Setjeka's.
  COMPLETION_CERTIFIED: 'APPROVALS',
  DEFECT_REPORTED: 'ACTIONS',
  DEFECT_ISSUED: 'ASSIGNMENTS',
  DEFECT_RECTIFIED: 'APPROVALS',
  DEFECT_DECIDED: 'ACTIONS',
  NOTE_FOR_YOU: 'ACTIONS',
  ACTION_ASSIGNED: 'ACTIONS',
  ACTION_COMPLETED: 'ACTIONS',
  MENTIONED: 'ACTIONS',
  TASK_ASSIGNED: 'ASSIGNMENTS',
  ISSUE_ASSIGNED: 'ASSIGNMENTS',
  RISK_ESCALATED: 'ASSIGNMENTS',
  DUE_SOON: 'DEADLINES',
  MEETING_SCHEDULED: 'ASSIGNMENTS',
  // No longer raised; kept so any older alerts still have a home.
  PHOTO_ADDED: 'ASSIGNMENTS',
  PHOTOS_SHARED: 'ASSIGNMENTS',
};

export function categoryOf(type: NotificationType): AlertCategory {
  return CATEGORY[type];
}

export function typesIn(category: AlertCategory): NotificationType[] {
  return (Object.keys(CATEGORY) as NotificationType[]).filter((t) => CATEGORY[t] === category);
}
