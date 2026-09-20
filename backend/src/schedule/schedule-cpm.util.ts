import { BadRequestException } from '@nestjs/common';

// Working-day (Mon-Fri) calendar only — see MEMORY.md for why: there is no
// holiday/non-working-day exception data anywhere in this app yet, so a
// fixed 5-day week is the CPM default for V1, matching the register's
// "durations, dates, calendars" ask at the simplest level that's still
// honest (no fabricated holiday calendar).

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Moves `days` working days forward (or back, if negative) from `start`. `addWorkingDays(d, 0)` returns `d` unchanged — this is an offset, not a duration span. */
export function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start.getTime());
  if (days === 0) return result;
  const direction = days > 0 ? 1 : -1;
  let remaining = Math.round(Math.abs(days));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + direction);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

// Counts working days strictly between two dates in the forward direction
// (end - start), used for float. Can be negative.
export function workingDaysBetween(start: Date, end: Date): number {
  if (end.getTime() === start.getTime()) return 0;
  const direction = end.getTime() > start.getTime() ? 1 : -1;
  const cursor = new Date(start.getTime());
  let count = 0;
  while (cursor.getTime() !== end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    if (!isWeekend(cursor)) count += direction;
    // Safety valve: dates in this app are always reasonably close
    // together (project-scale, not centuries), so a runaway loop here
    // means bad input, not a legitimate long gap.
    if (Math.abs(count) > 100_000) throw new BadRequestException('Date range too large to compute');
  }
  return count;
}

// Duration convention (matches MS Project/construction scheduling norms):
// a task of duration N starting on a working day OCCUPIES N working days
// INCLUSIVE of its start day — e.g. duration 5 starting Monday finishes
// that same Friday, not the following Monday. A 0-duration activity
// (milestone) starts and finishes on the same day.
export function endDateFromStart(start: Date, durationDays: number): Date {
  if (durationDays <= 0) return new Date(start.getTime());
  return addWorkingDays(start, durationDays - 1);
}

export function startDateFromEnd(end: Date, durationDays: number): Date {
  if (durationDays <= 0) return new Date(end.getTime());
  return addWorkingDays(end, -(durationDays - 1));
}

export interface CpmActivityInput {
  id: string;
  startDate: Date;
  durationDays: number;
  hasPredecessors: boolean;
}

export interface CpmDependencyInput {
  predecessorId: string;
  successorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface CpmResult {
  startDate: Date;
  endDate: Date;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  totalFloatDays: number;
  isCriticalPath: boolean;
}

export class ScheduleCycleError extends BadRequestException {
  constructor() {
    super('This dependency would create a circular reference in the schedule');
  }
}

function topologicalOrder(activityIds: string[], deps: CpmDependencyInput[]): string[] {
  const inDegree = new Map<string, number>(activityIds.map((id) => [id, 0]));
  const successorsOf = new Map<string, string[]>(activityIds.map((id) => [id, []]));
  for (const dep of deps) {
    successorsOf.get(dep.predecessorId)?.push(dep.successorId);
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) ?? 0) + 1);
  }

  const queue = activityIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const successorId of successorsOf.get(id) ?? []) {
      const next = (inDegree.get(successorId) ?? 0) - 1;
      inDegree.set(successorId, next);
      if (next === 0) queue.push(successorId);
    }
  }

  if (order.length !== activityIds.length) throw new ScheduleCycleError();
  return order;
}

/** Throws ScheduleCycleError if adding these dependencies would make the graph cyclic — without running the full date math. */
export function assertAcyclic(activityIds: string[], dependencies: CpmDependencyInput[]): void {
  topologicalOrder(activityIds, dependencies);
}

// FS carries an implicit one-working-day gap on top of any explicit lag —
// "finish to start" means the successor cannot start until the working day
// AFTER the predecessor's finish day (which, under the inclusive duration
// convention above, is itself still occupied by the predecessor).
function forwardConstraintStart(type: CpmDependencyInput['type'], predEarlyStart: Date, predEarlyFinish: Date, lagDays: number, successorDuration: number): Date {
  switch (type) {
    case 'FS':
      return addWorkingDays(predEarlyFinish, 1 + lagDays);
    case 'SS':
      return addWorkingDays(predEarlyStart, lagDays);
    case 'FF':
      return startDateFromEnd(addWorkingDays(predEarlyFinish, lagDays), successorDuration);
    case 'SF':
      return startDateFromEnd(addWorkingDays(predEarlyStart, lagDays), successorDuration);
  }
}

/**
 * Recomputes early/late start-finish, float and critical-path flags for
 * every activity in a project, and auto-schedules any activity that has at
 * least one predecessor to start as early as its constraints allow
 * (matching the register's "schedule logic recalculates dependent
 * activities" and standard forward-scheduling tool behaviour). Root
 * activities (no predecessor) keep whatever startDate is already stored —
 * that's the anchor the rest of the network schedules from.
 */
export function computeSchedule(activities: CpmActivityInput[], dependencies: CpmDependencyInput[]): Map<string, CpmResult> {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const order = topologicalOrder(
    activities.map((a) => a.id),
    dependencies,
  );

  const predecessorsOf = new Map<string, CpmDependencyInput[]>(activities.map((a) => [a.id, []]));
  const successorsOf = new Map<string, CpmDependencyInput[]>(activities.map((a) => [a.id, []]));
  for (const dep of dependencies) {
    predecessorsOf.get(dep.successorId)?.push(dep);
    successorsOf.get(dep.predecessorId)?.push(dep);
  }

  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();

  for (const id of order) {
    const activity = byId.get(id)!;
    const preds = predecessorsOf.get(id) ?? [];
    if (preds.length === 0) {
      earlyStart.set(id, activity.startDate);
      earlyFinish.set(id, endDateFromStart(activity.startDate, activity.durationDays));
      continue;
    }

    let constrainedStart: Date | null = null;
    for (const dep of preds) {
      const predEarlyStart = earlyStart.get(dep.predecessorId)!;
      const predEarlyFinish = earlyFinish.get(dep.predecessorId)!;
      const candidateStart = forwardConstraintStart(dep.type, predEarlyStart, predEarlyFinish, dep.lagDays, activity.durationDays);
      if (!constrainedStart || candidateStart.getTime() > constrainedStart.getTime()) constrainedStart = candidateStart;
    }

    earlyStart.set(id, constrainedStart!);
    earlyFinish.set(id, endDateFromStart(constrainedStart!, activity.durationDays));
  }

  const projectEnd = order.reduce<Date>((latest, id) => {
    const finish = earlyFinish.get(id)!;
    return finish.getTime() > latest.getTime() ? finish : latest;
  }, earlyFinish.get(order[0]) ?? new Date());

  const lateStart = new Map<string, Date>();
  const lateFinish = new Map<string, Date>();

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const activity = byId.get(id)!;
    const succs = successorsOf.get(id) ?? [];
    if (succs.length === 0) {
      lateFinish.set(id, projectEnd);
      lateStart.set(id, startDateFromEnd(projectEnd, activity.durationDays));
      continue;
    }

    // Mirror image of the forward pass: each dependency type constrains
    // either this (the predecessor's) lateFinish directly, or its
    // lateStart directly, depending on which end of the relationship it
    // sits on.
    let constrainedFinish: Date | null = null;
    let constrainedStart: Date | null = null;
    for (const dep of succs) {
      const succLateStart = lateStart.get(dep.successorId)!;
      const succLateFinish = lateFinish.get(dep.successorId)!;
      switch (dep.type) {
        case 'FS': {
          const candidate = addWorkingDays(succLateStart, -(1 + dep.lagDays));
          if (!constrainedFinish || candidate.getTime() < constrainedFinish.getTime()) constrainedFinish = candidate;
          break;
        }
        case 'FF': {
          const candidate = addWorkingDays(succLateFinish, -dep.lagDays);
          if (!constrainedFinish || candidate.getTime() < constrainedFinish.getTime()) constrainedFinish = candidate;
          break;
        }
        case 'SS': {
          const candidate = addWorkingDays(succLateStart, -dep.lagDays);
          if (!constrainedStart || candidate.getTime() < constrainedStart.getTime()) constrainedStart = candidate;
          break;
        }
        case 'SF': {
          const candidate = addWorkingDays(succLateFinish, -dep.lagDays);
          if (!constrainedStart || candidate.getTime() < constrainedStart.getTime()) constrainedStart = candidate;
          break;
        }
      }
    }

    if (constrainedFinish) {
      lateFinish.set(id, constrainedFinish);
      lateStart.set(id, startDateFromEnd(constrainedFinish, activity.durationDays));
    } else if (constrainedStart) {
      lateStart.set(id, constrainedStart);
      lateFinish.set(id, endDateFromStart(constrainedStart, activity.durationDays));
    } else {
      lateFinish.set(id, projectEnd);
      lateStart.set(id, startDateFromEnd(projectEnd, activity.durationDays));
    }
  }

  const results = new Map<string, CpmResult>();
  for (const id of order) {
    const activity = byId.get(id)!;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;
    const totalFloatDays = workingDaysBetween(es, ls);
    results.set(id, {
      startDate: activity.hasPredecessors ? es : activity.startDate,
      endDate: activity.hasPredecessors ? ef : endDateFromStart(activity.startDate, activity.durationDays),
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloatDays,
      isCriticalPath: totalFloatDays <= 0,
    });
  }
  return results;
}
