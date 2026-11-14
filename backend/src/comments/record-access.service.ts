import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { CommentEntityType, PermissionModule } from '../generated/prisma/enums.js';
import { HseService } from '../hse/hse.service.js';
import { NcrsService } from '../ncrs/ncrs.service.js';
import { PermitsService } from '../permits/permits.service.js';
import { PlantService } from '../plant/plant.service.js';
import { InspectionsService } from '../inspections/inspections.service.js';
import { SitePhotosService } from '../site-photos/site-photos.service.js';
import { InterfacesService } from '../site-records/interfaces.service.js';
import { HiddenWorksService } from '../site-records/hidden-works.service.js';
import { TimeClaimsService } from '../time-claims/time-claims.service.js';
import { HandoverService } from '../handover/handover.service.js';
import { DefectsService } from '../defects/defects.service.js';
import { QualityTestsService } from '../quality-tests/quality-tests.service.js';
import { SiteMeasureService } from '../quantity-surveying/site-measure.service.js';
import { scheduleVisibility } from '../schedule/schedule-visibility.js';

/** The screen (permission area) each kind of record lives on: a note thread
 * needs the same VIEW right as the record's own screen. */
const AREA: Partial<Record<CommentEntityType, PermissionModule>> = {
  TASK: 'TASKS',
  ISSUE: 'ISSUES',
  SCHEDULE_ACTIVITY: 'SCHEDULE',
  DOCUMENT_REVISION: 'DOCUMENTS',
  RISK: 'RISKS',
  RFI: 'RFIS',
  SUBMITTAL: 'SUBMITTALS',
  VARIATION: 'COMMERCIAL',
  COST_PLAN: 'COMMERCIAL',
  PROJECT_CONTRACT: 'COMMERCIAL',
  VALUATION: 'COMMERCIAL',
  DAYWORK: 'COMMERCIAL',
  STAGE_TRANSITION: 'STAGE_GATE',
  STAGE_DELIVERABLE: 'PROJECT_DEFINITION',
  PROJECT_BRIEF: 'PROJECT_DEFINITION',
  CONSENT: 'PROJECT_DEFINITION',
  MEETING: 'MEETINGS',
  SITE_PHOTO: 'SITE_PHOTOS',
  COMMUNICATION: 'COMMUNICATIONS',
  TIME_CLAIM: 'COMMUNICATIONS',
  HANDOVER_ITEM: 'COMMUNICATIONS',
  CONTRACT_DEFECT: 'COMMUNICATIONS',
  INSPECTION: 'INSPECTIONS',
  NCR: 'INSPECTIONS',
  TEST_RESULT: 'INSPECTIONS',
  HOLD_POINT: 'INSPECTIONS',
  INTERFACE: 'INSPECTIONS',
  HIDDEN_WORK: 'INSPECTIONS',
  HSE_INCIDENT: 'INSPECTIONS',
  WORK_PERMIT: 'INSPECTIONS',
  SITE_DIARY: 'INSPECTIONS',
  PLANT_ITEM: 'INSPECTIONS',
};

/** Records the client never sees, whatever the matrix says (Meeting 3:
 * Setjeka controls what the client sees). */
const TEAM_ONLY: CommentEntityType[] = ['PUNCH_ITEM', 'CLASH', 'SITE_DIARY'];

/** Whether a person can open a record, and so read and write its notes
 * (critique H-01, H-02, H-03): "you see a thread only if you can open its
 * record". The record's own service decides wherever it applies a finer rule
 * (a contractor sees only their own firm's site records; the client sees only
 * the photos Setjeka shared), so the two can't drift apart. */
@Injectable()
export class RecordAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get<T>(type: new (...args: never[]) => T): T {
    return this.moduleRef.get(type, { strict: false });
  }

  /** The record's own "open one" call, for records with a per-person rule. */
  private opener(entityType: CommentEntityType): ((projectId: string, userId: string, id: string) => Promise<unknown>) | null {
    switch (entityType) {
      case 'HSE_INCIDENT': return (p, u, id) => this.get(HseService).findOne(p, u, id);
      case 'NCR': return (p, u, id) => this.get(NcrsService).findOne(p, u, id);
      case 'WORK_PERMIT': return (p, u, id) => this.get(PermitsService).findOne(p, u, id);
      case 'PLANT_ITEM': return (p, u, id) => this.get(PlantService).findOne(p, u, id);
      case 'INSPECTION': return (p, u, id) => this.get(InspectionsService).findOne(p, u, id);
      case 'SITE_PHOTO': return (p, u, id) => this.get(SitePhotosService).findOne(p, u, id);
      case 'INTERFACE': return (p, u, id) => this.get(InterfacesService).findOne(p, u, id);
      case 'HIDDEN_WORK': return (p, u, id) => this.get(HiddenWorksService).findOne(p, u, id);
      case 'TIME_CLAIM': return (p, u, id) => this.get(TimeClaimsService).findOne(p, u, id);
      case 'HANDOVER_ITEM': return (p, u, id) => this.get(HandoverService).findOne(p, u, id);
      case 'CONTRACT_DEFECT': return (p, u, id) => this.get(DefectsService).findOne(p, u, id);
      case 'TEST_RESULT': return (p, u, id) => this.get(QualityTestsService).test(p, u, id);
      case 'HOLD_POINT': return (p, u, id) => this.get(QualityTestsService).point(p, u, id);
      case 'DAYWORK':
        return async (p, u, id) => {
          const d = await this.prisma.dayworkSheet.findFirst({ where: { id, projectId: p }, select: { contractId: true } });
          if (!d) throw new NotFoundException('Daywork sheet not found');
          return this.get(SiteMeasureService).dayworks(p, u, d.contractId);
        };
      // A contractor: notes on their own firm's activities only (M-02).
      case 'SCHEDULE_ACTIVITY':
        return async (p, u, id) => {
          const vis = await scheduleVisibility(this.prisma, p, u);
          if (vis && !vis.mine.has(id)) throw new NotFoundException('Activity not found');
        };
      default: return null;
    }
  }

  async canSee(projectId: string, userId: string, entityType: CommentEntityType, entityId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (!user) return false;
    if (user.role === 'ADMIN' || user.accountType === 'INTERNAL') return true;

    // Outside parties see only the projects they're on.
    const roles = (await this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } })).map((m) => m.role);
    if (!roles.length) return false;

    const area = AREA[entityType];
    if (area && !(await this.permissions.can(user.role, user.accountType, userId, projectId, area, 'VIEW', entityId))) return false;
    if (TEAM_ONLY.includes(entityType) && roles.every((r) => r === 'CLIENT')) return false;

    // A letter or instruction: its author, its recipients and Setjeka.
    if (entityType === 'COMMUNICATION') {
      return Boolean(await this.prisma.projectCommunication.findFirst({ where: { id: entityId, projectId, OR: [{ authorId: userId }, { recipients: { some: { userId } } }] } }));
    }

    const open = this.opener(entityType);
    if (!open) return true;
    try {
      await open(projectId, userId, entityId);
      return true;
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof ForbiddenException) return false;
      throw e;
    }
  }

  /** The notes, of those given, that this person may see. */
  async filter<T extends { projectId: string | null; entityType: CommentEntityType; entityId: string }>(userId: string, notes: T[]): Promise<T[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return notes;
    const out: T[] = [];
    const seen = new Map<string, boolean>();
    for (const n of notes) {
      if (!n.projectId) continue;
      const key = `${n.projectId}:${n.entityType}:${n.entityId}`;
      if (!seen.has(key)) seen.set(key, await this.canSee(n.projectId, userId, n.entityType, n.entityId));
      if (seen.get(key)) out.push(n);
    }
    return out;
  }
}
