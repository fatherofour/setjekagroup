import { BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// Parses the documented MS Project "Project XML" interchange format
// (stable since Project 2003 — File > Save As > XML in MS Project). This
// is deliberately NOT a .mpp (binary) parser — that format is proprietary
// with no public spec — and NOT a Primavera P6 (.xer) parser, since which
// format the client's files actually use was an open, unconfirmed question
// as of Meeting 002 (action 6.5). Only the core scheduling fields are
// read (dates, duration, hierarchy, dependencies, milestone flag, percent
// complete) — resource/assignment/cost fields in the file are ignored,
// matching the platform's "not a system of record for cost" boundary
// (Meeting 002 decision 2.4).

const DEPENDENCY_TYPE_BY_CODE: Record<number, 'FF' | 'FS' | 'SF' | 'SS'> = {
  0: 'FF',
  1: 'FS',
  2: 'SF',
  3: 'SS',
};

// MS Project's default calendar is an 8-hour working day; Duration fields
// are serialized in hours (e.g. "PT40H0M0S" = 5 working days). LinkLag is
// documented as tenths-of-minutes for the common day-based LagFormats —
// this covers the standard case, not every LagFormat variant MS Project
// can produce.
const HOURS_PER_DAY = 8;

function parseIsoDuration(value: string | undefined): number {
  if (!value) return 0;
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value.trim());
  if (!match) return 0;
  const hours = parseFloat(match[1] ?? '0');
  const minutes = parseFloat(match[2] ?? '0');
  const seconds = parseFloat(match[3] ?? '0');
  return hours + minutes / 60 + seconds / 3600;
}

export interface ParsedMsProjectActivity {
  uid: string;
  name: string;
  startDate: Date;
  durationDays: number;
  percentComplete: number;
  isMilestone: boolean;
  outlineLevel: number;
}

export interface ParsedMsProjectDependency {
  predecessorUid: string;
  successorUid: string;
  type: 'FF' | 'FS' | 'SF' | 'SS';
  lagDays: number;
}

export interface ParsedMsProjectSchedule {
  activities: ParsedMsProjectActivity[];
  dependencies: ParsedMsProjectDependency[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// MS Project XML timestamps ("2026-02-02T08:00:00") carry no timezone
// offset, so a plain `new Date(...)` parses them as the SERVER's local
// time — on a server in a different timezone than the one that produced
// this string, that can silently shift the parsed value into the
// adjacent UTC day and corrupt the working-day calendar. The whole CPM
// engine only cares about which calendar day an activity falls on (not
// time-of-day), so we take just the date portion and anchor it at UTC
// midnight, the same convention every other date in this app already
// uses (a date-only "YYYY-MM-DD" string is UTC per the JS Date spec).
function parseCalendarDate(value: string | undefined): Date {
  if (!value) return new Date(new Date().toISOString().slice(0, 10));
  const datePart = value.slice(0, 10);
  const parsed = new Date(datePart);
  return Number.isNaN(parsed.getTime()) ? new Date(new Date().toISOString().slice(0, 10)) : parsed;
}

export function parseMsProjectXml(xml: string): ParsedMsProjectSchedule {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new BadRequestException('Could not parse this file as XML');
  }

  const project = (doc as Record<string, unknown>)?.Project as Record<string, unknown> | undefined;
  const tasksNode = project?.Tasks as Record<string, unknown> | undefined;
  const rawTasks = toArray(tasksNode?.Task as Record<string, unknown> | Record<string, unknown>[] | undefined);
  if (rawTasks.length === 0) {
    throw new BadRequestException('No <Task> elements found — is this a valid MS Project XML export?');
  }

  const activities: ParsedMsProjectActivity[] = [];
  const dependencies: ParsedMsProjectDependency[] = [];

  for (const task of rawTasks) {
    const uid = String(task.UID ?? '');
    if (!uid) continue;
    // MS Project always includes a synthetic UID "0" root/project-summary
    // task — it has no meaningful name/dates and isn't a real activity.
    if (uid === '0') continue;

    const name = String(task.Name ?? 'Untitled activity');
    const startDate = parseCalendarDate(task.Start as string | undefined);
    const isMilestone = String(task.Milestone ?? '0') === '1';
    const durationHours = parseIsoDuration(task.Duration as string | undefined);
    const durationDays = isMilestone ? 0 : Math.max(durationHours / HOURS_PER_DAY, 0.125);
    const percentComplete = Math.round(Number(task.PercentComplete ?? 0));
    const outlineLevel = Number(task.OutlineLevel ?? 1);

    activities.push({ uid, name, startDate, durationDays, percentComplete, isMilestone, outlineLevel });

    for (const link of toArray(task.PredecessorLink as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const predecessorUid = String(link.PredecessorUID ?? '');
      if (!predecessorUid || predecessorUid === '0') continue;
      const typeCode = Number(link.Type ?? 1);
      const linkLagRaw = Number(link.LinkLag ?? 0);
      // Tenths-of-minutes -> days, per the standard day-based LagFormats.
      const lagDays = linkLagRaw / 10 / 60 / HOURS_PER_DAY;
      dependencies.push({
        predecessorUid,
        successorUid: uid,
        type: DEPENDENCY_TYPE_BY_CODE[typeCode] ?? 'FS',
        lagDays,
      });
    }
  }

  if (activities.length === 0) {
    throw new BadRequestException('No importable activities found in this file');
  }

  return { activities, dependencies };
}
