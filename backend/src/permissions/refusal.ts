import type { PermissionAction, PermissionModule } from '../generated/prisma/enums.js';

// Critique L-01: a refusal says, in plain words, what the person can't do
// and where - not "You do not have VIEW permission on INSPECTIONS", which
// both shows an internal code and names the wrong area (the HSE, NCR, test,
// diary and plant screens all share the INSPECTIONS permission).

const MODULE_AREA: Record<PermissionModule, string> = {
  SCHEDULE: 'the programme',
  TASKS: 'tasks',
  ISSUES: 'issues',
  RISKS: 'the risk register',
  DOCUMENTS: 'documents',
  TRANSMITTALS: 'transmittals',
  RFIS: 'RFIs',
  SUBMITTALS: 'submittals',
  PROJECT_STRUCTURE: "the project's details",
  TEAM: 'the project team',
  COMMENTS: 'notes',
  STAGE_GATE: 'stage moves',
  PROCUREMENT: 'procurement',
  PROJECT_DEFINITION: 'the Stage 1 documents',
  MEETINGS: 'meetings',
  COMMERCIAL: 'commercial records',
  SITE_PHOTOS: 'site photos',
  COMMUNICATIONS: 'instructions and letters',
  INSPECTIONS: 'inspections',
};

// The screen behind the route, where it is more specific than the module.
const PATH_AREA: [RegExp, string][] = [
  [/\/hse\/incidents/, 'health and safety incidents'],
  [/\/hse\/permits/, 'permits to work'],
  [/\/ncrs/, 'NCRs'],
  [/\/quality/, 'tests and hold points'],
  [/\/interfaces/, 'interfaces and hidden works'],
  [/\/site-diary/, 'the site diary'],
  [/\/look-ahead/, 'the look-ahead'],
  [/\/plant/, 'the plant register'],
  [/\/qs\//, "the QS's records"],
  [/\/schedule\//, 'the programme'],
  [/\/drawings/, 'the drawing register'],
];

const VERB: Record<PermissionAction, string> = {
  VIEW: 'see',
  CREATE: 'add to',
  EDIT: 'change',
  DELETE: 'remove anything from',
  APPROVE: 'approve',
  COMMENT: 'comment on',
};

export function refusalMessage(module: PermissionModule, action: PermissionAction, path: string): string {
  const area = PATH_AREA.find(([re]) => re.test(path))?.[1] ?? MODULE_AREA[module] ?? 'this';
  return `Your role on this project can't ${VERB[action] ?? 'use'} ${area}.`;
}
