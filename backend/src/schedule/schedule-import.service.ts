import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ScheduleService } from './schedule.service.js';
import { parseMsProjectXml } from './msproject-xml.util.js';
import { ScheduleCycleError, assertAcyclic, endDateFromStart, type CpmDependencyInput } from './schedule-cpm.util.js';

@Injectable()
export class ScheduleImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly scheduleService: ScheduleService,
  ) {}

  async importMsProjectXml(projectId: string, ownerId: string, xml: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const parsed = parseMsProjectXml(xml);

    // Reconstruct parent/child from OutlineLevel: each activity's parent is
    // whichever activity was most recently seen one level shallower — the
    // standard technique for rebuilding a tree from an indent/outline list.
    const lastSeenAtLevel = new Map<number, string>();
    const parentByUid = new Map<string, string | null>();
    for (const activity of parsed.activities) {
      parentByUid.set(activity.uid, activity.outlineLevel > 1 ? (lastSeenAtLevel.get(activity.outlineLevel - 1) ?? null) : null);
      lastSeenAtLevel.set(activity.outlineLevel, activity.uid);
    }

    const uidToRealId = new Map<string, string>();
    let sortOrder = 0;
    for (const activity of parsed.activities) {
      const created = await this.prisma.scheduleActivity.create({
        data: {
          projectId,
          name: activity.name,
          activityType: activity.isMilestone ? 'MILESTONE' : 'TASK',
          startDate: activity.startDate,
          endDate: endDateFromStart(activity.startDate, activity.durationDays),
          durationDays: activity.durationDays,
          percentComplete: Math.min(100, Math.max(0, activity.percentComplete)),
          sortOrder: sortOrder++,
          importedFromMsProject: true,
        },
      });
      uidToRealId.set(activity.uid, created.id);
    }

    // Second pass: now that every activity has a real ID, wire up parentId.
    for (const activity of parsed.activities) {
      const parentUid = parentByUid.get(activity.uid);
      if (!parentUid) continue;
      const parentRealId = uidToRealId.get(parentUid);
      if (!parentRealId) continue;
      await this.prisma.scheduleActivity.update({
        where: { id: uidToRealId.get(activity.uid)! },
        data: { parentId: parentRealId },
      });
    }

    const candidateDeps: (CpmDependencyInput & { key: string })[] = [];
    let dependenciesSkipped = 0;
    for (const dep of parsed.dependencies) {
      const predecessorId = uidToRealId.get(dep.predecessorUid);
      const successorId = uidToRealId.get(dep.successorUid);
      if (!predecessorId || !successorId || predecessorId === successorId) {
        dependenciesSkipped++;
        continue;
      }
      candidateDeps.push({ predecessorId, successorId, type: dep.type, lagDays: dep.lagDays, key: `${predecessorId}>${successorId}` });
    }
    // De-duplicate (the unique constraint is on predecessor+successor —
    // a source file can legitimately list the same link twice).
    const seen = new Set<string>();
    const dedupedDeps = candidateDeps.filter((d) => (seen.has(d.key) ? false : (seen.add(d.key), true)));
    dependenciesSkipped += candidateDeps.length - dedupedDeps.length;

    // Check the WHOLE imported dependency set for cycles before inserting
    // any of it — a partial insert followed by a crash in recalculate()
    // below would leave the project's schedule half-imported.
    let dependenciesCreated = 0;
    try {
      assertAcyclic(Array.from(uidToRealId.values()), dedupedDeps);
      if (dedupedDeps.length > 0) {
        await this.prisma.scheduleDependency.createMany({
          data: dedupedDeps.map((d) => ({ projectId, predecessorId: d.predecessorId, successorId: d.successorId, type: d.type, lagDays: d.lagDays })),
        });
        dependenciesCreated = dedupedDeps.length;
      }
    } catch (err) {
      if (err instanceof ScheduleCycleError) {
        dependenciesSkipped += dedupedDeps.length;
      } else {
        throw err;
      }
    }

    // Recalculates critical path ourselves from the imported data — the
    // platform's own CPM output, not whatever the source file claims.
    await this.scheduleService.recalculate(projectId);

    return {
      activitiesImported: parsed.activities.length,
      dependenciesImported: dependenciesCreated,
      dependenciesSkipped,
    };
  }
}
