import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { computeComplianceStatus } from '../compliance-records/compliance-status.util.js';
import { HIGH_SEVERITY_THRESHOLD } from '../project-risks/project-risks.service.js';

@Injectable()
export class ProjectDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getDashboard(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);

    const [activities, tasks, issues, risks, rfis, submittals, rfqs, purchaseOrders, appointments, comments] = await Promise.all([
      this.prisma.scheduleActivity.findMany({ where: { projectId } }),
      this.prisma.projectTask.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.projectIssue.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.projectRisk.findMany({ where: { projectId }, select: { status: true, probability: true, impact: true } }),
      this.prisma.rfi.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.submittal.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.rfq.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.purchaseOrder.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.organisationProjectAppointment.findMany({
        where: { projectId },
        include: {
          contractor: { include: { complianceRecords: true } },
          ratings: true,
        },
      }),
      this.prisma.comment.findMany({
        where: { projectId },
        include: { author: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Schedule summary — reuses the same cached CPM fields the Schedule
    // module already computes; this endpoint never recalculates anything.
    const totalActivities = activities.length;
    const completedActivities = activities.filter((a) => a.status === 'COMPLETED').length;
    const criticalPathCount = activities.filter((a) => a.isCriticalPath).length;
    const upcomingMilestones = activities
      .filter((a) => a.activityType === 'MILESTONE' && a.startDate.getTime() >= Date.now())
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, 3)
      .map((a) => ({ id: a.id, name: a.name, date: a.startDate }));

    // Compliance snapshot across every contractor appointed to this project
    // — reuses computeComplianceStatus rather than duplicating its logic.
    const complianceCounts = { VALID: 0, EXPIRING_SOON: 0, EXPIRED: 0, PENDING_VERIFICATION: 0 };
    const seenContractorIds = new Set<string>();
    for (const appointment of appointments) {
      if (seenContractorIds.has(appointment.contractorId)) continue;
      seenContractorIds.add(appointment.contractorId);
      for (const record of appointment.contractor.complianceRecords) {
        complianceCounts[computeComplianceStatus(record)]++;
      }
    }

    const overdueRfiCount = await this.prisma.rfi.count({
      where: { projectId, dueDate: { lt: new Date() }, status: { not: 'CLOSED' } },
    });

    const allRatings = appointments.flatMap((a) => a.ratings);
    const averageRating = allRatings.length > 0 ? allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length : null;

    // groupBy can't express "count where probability*impact >= threshold"
    // without raw SQL, so the risk breakdown is computed in JS from the
    // fetched rows instead — cheap at this app's scale.
    const riskCountsByStatus: Record<string, number> = {};
    let highSeverityRiskCount = 0;
    for (const risk of risks) {
      riskCountsByStatus[risk.status] = (riskCountsByStatus[risk.status] ?? 0) + 1;
      if (risk.probability * risk.impact >= HIGH_SEVERITY_THRESHOLD) highSeverityRiskCount++;
    }

    return {
      schedule: { totalActivities, completedActivities, criticalPathCount, upcomingMilestones },
      tasks: Object.fromEntries(tasks.map((t) => [t.status, t._count])),
      issues: Object.fromEntries(issues.map((i) => [i.status, i._count])),
      risks: { byStatus: riskCountsByStatus, highSeverityCount: highSeverityRiskCount },
      rfis: { byStatus: Object.fromEntries(rfis.map((r) => [r.status, r._count])), overdueCount: overdueRfiCount },
      submittals: { byStatus: Object.fromEntries(submittals.map((s) => [s.status, s._count])) },
      rfqs: { byStatus: Object.fromEntries(rfqs.map((r) => [r.status, r._count])) },
      purchaseOrders: { byStatus: Object.fromEntries(purchaseOrders.map((p) => [p.status, p._count])) },
      compliance: complianceCounts,
      contractorsCount: seenContractorIds.size,
      ratings: { average: averageRating, count: allRatings.length },
      recentComments: comments,
    };
  }
}
