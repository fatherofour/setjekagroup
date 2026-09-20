export type ActivityType = 'TASK' | 'MILESTONE';
export type SchedulePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ScheduleActivityStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'DELAYED';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface ProjectNodeLite {
  id: string;
  name: string;
  type: string;
}

export interface ContractorLite {
  id: string;
  name: string;
}

export interface ProjectMemberLite {
  id: string;
  externalName: string | null;
  user: { id: string; fullName: string } | null;
}

export interface ScheduleDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface ScheduleActivity {
  id: string;
  projectId: string;
  parentId: string | null;
  projectNodeId: string | null;
  contractorId: string | null;
  assignedToId: string | null;
  name: string;
  description: string | null;
  activityType: ActivityType;
  startDate: string;
  endDate: string;
  durationDays: number;
  percentComplete: number;
  priority: SchedulePriority;
  status: ScheduleActivityStatus;
  sortOrder: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloatDays: number | null;
  isCriticalPath: boolean;
  importedFromMsProject: boolean;
  asSuccessorOf: ScheduleDependency[];
  projectNode: ProjectNodeLite | null;
  contractor: ContractorLite | null;
  assignedTo: ProjectMemberLite | null;
}

export const PRIORITY_LABEL: Record<SchedulePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const STATUS_LABEL: Record<ScheduleActivityStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  ON_HOLD: 'On hold',
  DELAYED: 'Delayed',
};

export const DEPENDENCY_TYPE_LABEL: Record<DependencyType, string> = {
  FS: 'Finish-to-Start',
  SS: 'Start-to-Start',
  FF: 'Finish-to-Finish',
  SF: 'Start-to-Finish',
};

export const STATUS_ORDER: ScheduleActivityStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'DELAYED', 'COMPLETED'];

export const STATUS_DOT: Record<ScheduleActivityStatus, string> = {
  NOT_STARTED: 'bg-slate-400',
  IN_PROGRESS: 'bg-blue-500',
  COMPLETED: 'bg-emerald-500',
  ON_HOLD: 'bg-amber-500',
  DELAYED: 'bg-red-500',
};

export const PRIORITY_BADGE: Record<SchedulePriority, string> = {
  LOW: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  MEDIUM: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  CRITICAL: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export function assigneeLabel(activity: ScheduleActivity): string | null {
  if (activity.contractor) return activity.contractor.name;
  if (activity.assignedTo) return activity.assignedTo.user?.fullName ?? activity.assignedTo.externalName ?? null;
  return null;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function toDateInputValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export interface ActivityTreeRow {
  activity: ScheduleActivity;
  depth: number;
  hasChildren: boolean;
}

// Same "group children by parentId, sort by sortOrder, DFS walk" technique
// as ProjectNodeTree.tsx's buildTree — kept independent because this one
// also has to be tolerant of a dangling parentId (an activity whose parent
// was deleted without cascading a re-parent, or a cross-project import
// edge case) by falling back to root rather than dropping the row.
export function buildActivityTree(activities: ScheduleActivity[]): ActivityTreeRow[] {
  const byId = new Set(activities.map((a) => a.id));
  const byParent = new Map<string | null, ScheduleActivity[]>();
  for (const activity of activities) {
    const key = activity.parentId && byId.has(activity.parentId) ? activity.parentId : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(activity);
    else byParent.set(key, [activity]);
  }
  for (const bucket of byParent.values()) bucket.sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate));

  const rows: ActivityTreeRow[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const activity of byParent.get(parentId) ?? []) {
      rows.push({ activity, depth, hasChildren: (byParent.get(activity.id)?.length ?? 0) > 0 });
      walk(activity.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}

// Every descendant of `activityId`, itself included — used to keep an
// activity from being re-parented under (or made to depend on) its own
// subtree, which would otherwise silently produce a cycle the backend
// would then reject anyway, but with a much less useful error message.
export function descendantIds(activities: ScheduleActivity[], activityId: string): Set<string> {
  const byParent = new Map<string | null, ScheduleActivity[]>();
  for (const activity of activities) {
    const bucket = byParent.get(activity.parentId);
    if (bucket) bucket.push(activity);
    else byParent.set(activity.parentId, [activity]);
  }
  const result = new Set<string>([activityId]);
  function walk(id: string) {
    for (const child of byParent.get(id) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        walk(child.id);
      }
    }
  }
  walk(activityId);
  return result;
}
