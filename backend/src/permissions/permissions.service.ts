import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PermissionModule, PermissionAction, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The permission engine: role x project x module x record x action.
   * ADMIN always passes. Internal users with no explicit ProjectMember
   * row on this project default-allow (preserves today's behavior for an
   * internal owner/admin who was never added as a member); external
   * users with no membership row are denied outright. Otherwise, a
   * MemberPermissionOverride (record-specific first, then module-wide)
   * takes precedence over the RolePermission default for their role. */
  async can(
    userRole: string,
    accountType: string,
    userId: string,
    projectId: string,
    module: PermissionModule,
    action: PermissionAction,
    recordId?: string,
  ): Promise<boolean> {
    if (userRole === 'ADMIN') return true;

    const member = await this.prisma.projectMember.findFirst({ where: { projectId, userId } });
    if (!member) return accountType === 'INTERNAL';

    const recordOr: Prisma.MemberPermissionOverrideWhereInput[] = [{ recordId: null }];
    if (recordId) recordOr.push({ recordId });

    const overrides = await this.prisma.memberPermissionOverride.findMany({
      where: {
        projectMemberId: member.id,
        module,
        action,
        AND: [{ OR: recordOr }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
    });
    const specific = overrides.find((o) => o.recordId != null);
    if (specific) return specific.allowed;
    const moduleWide = overrides.find((o) => o.recordId == null);
    if (moduleWide) return moduleWide.allowed;

    const rolePermission = await this.prisma.rolePermission.findUnique({
      where: { role_module_action: { role: member.role, module, action } },
    });
    return rolePermission?.allowed ?? false;
  }

  getRoleMatrix() {
    return this.prisma.rolePermission.findMany({ orderBy: [{ role: 'asc' }, { module: 'asc' }, { action: 'asc' }] });
  }

  async updateRoleMatrix(
    rows: { role: ProjectMemberRole; module: PermissionModule; action: PermissionAction; allowed: boolean }[],
  ) {
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.rolePermission.upsert({
          where: { role_module_action: { role: row.role, module: row.module, action: row.action } },
          update: { allowed: row.allowed },
          create: row,
        }),
      ),
    );
    return this.getRoleMatrix();
  }

  listOverrides(projectMemberId: string) {
    return this.prisma.memberPermissionOverride.findMany({
      where: { projectMemberId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createOverride(data: {
    projectMemberId: string;
    module: PermissionModule;
    action: PermissionAction;
    recordId?: string;
    allowed: boolean;
    expiresAt?: Date;
  }) {
    return this.prisma.memberPermissionOverride.create({ data });
  }

  async deleteOverride(id: string) {
    await this.prisma.memberPermissionOverride.delete({ where: { id } });
  }
}
