import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionModule as Modules, PermissionAction as Actions } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PermissionModule, PermissionAction, ProjectMemberRole } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Work that is Setjeka's own (the user's rule, 14 Nov 2026): buying (RFQs,
 * quotes, orders), the project team, the project's structure and moving the
 * stage. An outside account (a consultant, a contractor, an outside site or
 * HSE manager, the client) can't do these, whatever role it holds; they keep
 * VIEW and COMMENT, and the client still signs stage moves (APPROVE). */
const SETJEKA_ONLY: Partial<Record<PermissionModule, PermissionAction[]>> = {
  PROCUREMENT: ['CREATE', 'EDIT', 'DELETE', 'APPROVE'],
  TEAM: ['CREATE', 'EDIT', 'DELETE', 'APPROVE'],
  PROJECT_STRUCTURE: ['CREATE', 'EDIT', 'DELETE', 'APPROVE'],
  STAGE_GATE: ['CREATE', 'EDIT', 'DELETE'],
};
export const setjekaOnly = (module: PermissionModule, action: PermissionAction) => Boolean(SETJEKA_ONLY[module]?.includes(action));

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
    if (accountType !== 'INTERNAL' && setjekaOnly(module, action)) return false;

    // Budgets, variations, valuations and fees: Setjeka's own staff, the QS
    // and the client (critique M-01). An outside firm's site or HSE manager
    // holds a "Setjeka team" role on the matrix, but isn't Setjeka, so the API
    // refuses them exactly as the menu hides Commercial from them
    // (frontend lib/project-access.ts, seesCommercial).
    if (module === 'COMMERCIAL' && accountType !== 'INTERNAL') {
      const roles = (await this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { role: true } })).map((m) => m.role);
      if (!roles.some((r) => r === 'CLIENT' || r === 'QUANTITY_SURVEYOR')) return false;
    }

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

  /** Everything this person may do on a project, area by area, worked out
   * the same way as can() (without record-specific overrides), so screens
   * offer only the actions the API will accept (critique M-09). */
  async mine(userId: string, projectId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (!user) throw new ForbiddenException('You do not have access to this project');
    const modules = Object.values(Modules) as PermissionModule[];
    const actions = Object.values(Actions) as PermissionAction[];
    const all = (v: boolean) => Object.fromEntries(modules.map((m) => [m, Object.fromEntries(actions.map((a) => [a, v]))]));
    if (user.role === 'ADMIN') return all(true);
    const members = await this.prisma.projectMember.findMany({ where: { projectId, userId }, select: { id: true, role: true } });
    if (!members.length) {
      if (user.accountType === 'INTERNAL') return all(true);
      throw new ForbiddenException('You do not have access to this project');
    }
    // can() reads the first membership row; so does this.
    const member = members[0];
    const [overrides, roleRows] = await Promise.all([
      this.prisma.memberPermissionOverride.findMany({ where: { projectMemberId: member.id, recordId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
      this.prisma.rolePermission.findMany({ where: { role: member.role } }),
    ]);
    const commercialOk = user.accountType === 'INTERNAL' || members.some((m) => m.role === 'CLIENT' || m.role === 'QUANTITY_SURVEYOR');
    return Object.fromEntries(
      modules.map((m) => [
        m,
        Object.fromEntries(
          actions.map((a) => {
            if (m === 'COMMERCIAL' && !commercialOk) return [a, false];
            if (user.accountType !== 'INTERNAL' && setjekaOnly(m, a)) return [a, false];
            const o = overrides.find((x) => x.module === m && x.action === a);
            if (o) return [a, o.allowed];
            return [a, roleRows.find((r) => r.module === m && r.action === a)?.allowed ?? false];
          }),
        ),
      ]),
    );
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
