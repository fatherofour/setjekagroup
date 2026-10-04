import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { GrantPortalAccessDto } from './dto/grant-portal-access.dto.js';

export type PortalKind = 'client' | 'contractor';

const PORTAL_USER_SELECT = { id: true, email: true, fullName: true, status: true, createdAt: true } as const;

/** Client portal and vendor portal logins are ordinary EXTERNAL accounts
 * tied to one organisation via User.clientId / User.contractorId. No email
 * provider is connected, so (like the Administration invite flow) granting
 * access returns a set-password link for the user to share manually. */
@Injectable()
export class PortalAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  private orgField(kind: PortalKind) {
    return kind === 'client' ? 'clientId' : 'contractorId';
  }

  private async assertOrgExists(kind: PortalKind, orgId: string) {
    const found =
      kind === 'client'
        ? await this.prisma.client.findUnique({ where: { id: orgId }, select: { id: true } })
        : await this.prisma.contractor.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!found) throw new NotFoundException(kind === 'client' ? 'Client not found' : 'Contractor not found');
  }

  async list(kind: PortalKind, orgId: string) {
    await this.assertOrgExists(kind, orgId);
    return this.prisma.user.findMany({
      where: { [this.orgField(kind)]: orgId },
      select: PORTAL_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async grant(kind: PortalKind, orgId: string, dto: GrantPortalAccessDto) {
    await this.assertOrgExists(kind, orgId);
    const email = dto.email.trim();
    const existing = await this.usersService.findByEmail(email);

    let userId: string;
    if (existing) {
      if (existing.accountType === 'INTERNAL') {
        throw new BadRequestException('That email belongs to an internal staff account');
      }
      const ownOrg = kind === 'client' ? existing.clientId : existing.contractorId;
      const otherOrg = kind === 'client' ? existing.contractorId : existing.clientId;
      if ((ownOrg && ownOrg !== orgId) || otherOrg) {
        throw new ConflictException('That email already has portal access for another organisation');
      }
      userId = existing.id;
    } else {
      const created = await this.usersService.invite({ email, fullName: dto.fullName.trim(), accountType: 'EXTERNAL' });
      userId = created.id;
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data: { [this.orgField(kind)]: orgId } });
    const setPasswordLink = await this.authService.generateResetLink(user);
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status, createdAt: user.createdAt },
      setPasswordLink,
    };
  }

  private async findPortalUser(kind: PortalKind, orgId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, [this.orgField(kind)]: orgId } });
    if (!user) throw new NotFoundException('Portal user not found for this organisation');
    return user;
  }

  async resendInvite(kind: PortalKind, orgId: string, userId: string) {
    const user = await this.findPortalUser(kind, orgId, userId);
    return { setPasswordLink: await this.authService.generateResetLink(user) };
  }

  /** Unlinks the login from this organisation's portal. The account itself
   * (and any project memberships it was given at conversion) is left alone -
   * those are managed from Administration and each project's Team tab. */
  async revoke(kind: PortalKind, orgId: string, userId: string) {
    await this.findPortalUser(kind, orgId, userId);
    await this.prisma.user.update({ where: { id: userId }, data: { [this.orgField(kind)]: null } });
  }
}
