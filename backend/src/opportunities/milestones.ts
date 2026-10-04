import type { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ProjectStage } from '../generated/prisma/enums.js';

/** Register DEV R12 "Development milestones — from concept through
 * handover". The template covers the Stage 0 events and the end of each
 * PROCSA stage; each keyed milestone records its actual date itself when
 * the event happens (markMilestone). */
export const MILESTONE_TEMPLATE: { key: string; name: string }[] = [
  { key: 'CLIENT_VISION', name: 'Client vision confirmed (0.3)' },
  { key: 'MARKET_RESEARCH', name: 'Market research complete (0.6)' },
  { key: 'SITE_SECURED', name: 'Site secured (0.4)' },
  { key: 'LAND_RIGHTS', name: 'Land-use rights approved (0.5)' },
  { key: 'INVESTMENT_DECISION', name: 'Investment decision approved' },
  { key: 'PROJECT_INCEPTION', name: 'Project enters Inception' },
  { key: 'STAGE_1', name: 'Stage 1 Inception complete' },
  { key: 'STAGE_2', name: 'Stage 2 Concept & Viability complete' },
  { key: 'STAGE_3', name: 'Stage 3 Design Development complete' },
  { key: 'STAGE_4', name: 'Stage 4 Documentation & Procurement complete' },
  { key: 'STAGE_5', name: 'Stage 5 Construction — practical completion' },
  { key: 'STAGE_6', name: 'Stage 6 Close-out & handover' },
];

/** Approving a stage gate out of `fromStage` completes that stage. */
export const MILESTONE_FOR_STAGE_EXIT: Partial<Record<ProjectStage, string>> = {
  INCEPTION: 'STAGE_1',
  CONCEPT: 'STAGE_2',
  DESIGN: 'STAGE_3',
  DOCUMENTATION_PROCUREMENT: 'STAGE_4',
  CONSTRUCTION: 'STAGE_5',
};

export type MilestoneStatus = 'COMPLETED' | 'COMPLETED_LATE' | 'OVERDUE' | 'SLIPPED' | 'ON_TRACK' | 'NOT_SCHEDULED';

const DAY = 24 * 60 * 60 * 1000;

/** Baseline = the date first committed to; target = the current forecast;
 * actual = when it happened. Slipped means the target has moved past the
 * baseline; overdue means the target has passed without an actual. */
export function milestoneStatus(m: { baselineDate: Date | null; targetDate: Date | null; actualDate: Date | null }, now = new Date()) {
  let status: MilestoneStatus;
  if (m.actualDate) status = m.targetDate && m.actualDate.getTime() > m.targetDate.getTime() + DAY ? 'COMPLETED_LATE' : 'COMPLETED';
  else if (!m.targetDate) status = 'NOT_SCHEDULED';
  else if (m.targetDate.getTime() + DAY < now.getTime()) status = 'OVERDUE';
  else if (m.baselineDate && m.targetDate.getTime() > m.baselineDate.getTime() + DAY) status = 'SLIPPED';
  else status = 'ON_TRACK';
  const compareTo = m.actualDate ?? m.targetDate;
  const varianceDays = m.baselineDate && compareTo ? Math.round((compareTo.getTime() - m.baselineDate.getTime()) / DAY) : null;
  return { status, varianceDays };
}

/** Records the actual date on a keyed milestone, if it exists and has none
 * yet. A no-op when the template was never added. */
export async function markMilestone(
  prisma: PrismaService | Prisma.TransactionClient,
  owner: { opportunityId: string } | { projectId: string },
  key: string,
  when = new Date(),
) {
  await prisma.developmentMilestone.updateMany({ where: { ...owner, key, actualDate: null }, data: { actualDate: when } });
}
