import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { CreateMemberDto } from './dto/create-member.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';

const MEMBER_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  contractor: { select: { id: true, name: true, tradeType: true } },
} as const;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  async findAll(projectId: string, ownerId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { ...MEMBER_INCLUDE, user: { select: { id: true, fullName: true, email: true, accountType: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // An outside party sees the email and phone of Setjeka's staff, the
    // client and their own firm, not of other firms' people (critique
    // V3-L-09). Names, roles and firms stay visible to everyone.
    const me = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, accountType: true } });
    const strip = <T extends (typeof rows)[number]>(m: T) => ({ ...m, user: m.user ? { id: m.user.id, fullName: m.user.fullName, email: m.user.email } : null });
    if (me?.role === 'ADMIN' || me?.accountType === 'INTERNAL') return rows.map(strip);
    const mine = rows.filter((m) => m.userId === ownerId);
    const myFirms = new Set(mine.flatMap((m) => (m.contractorId ? [m.contractorId] : [])));
    const shown = (m: (typeof rows)[number]) =>
      m.userId === ownerId || m.role === 'CLIENT' || m.user?.accountType === 'INTERNAL' || m.user?.role === 'ADMIN' || (m.contractorId != null && myFirms.has(m.contractorId));
    return rows.map((m) => {
      const out = strip(m);
      return shown(m) ? out : { ...out, externalEmail: null, externalPhone: null, user: out.user ? { ...out.user, email: null } : null };
    });
  }

  private async assertContractorExists(contractorId: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new BadRequestException('Contractor not found');
  }

  async create(projectId: string, ownerId: string, dto: CreateMemberDto) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    if (dto.contractorId) await this.assertContractorExists(dto.contractorId);

    let userId = dto.userId;
    let setPasswordLink: string | undefined;
    if (dto.inviteAsUser) {
      if (!dto.externalEmail) throw new BadRequestException('externalEmail is required to invite a user');
      const existing = await this.usersService.findByEmail(dto.externalEmail);
      const user =
        existing ??
        (await this.usersService.invite({
          email: dto.externalEmail,
          fullName: dto.externalName ?? dto.externalEmail,
          accountType: 'EXTERNAL',
        }));
      userId = user.id;
      setPasswordLink = await this.authService.generateResetLink(user);
    }

    const member = await this.prisma.projectMember.create({
      data: {
        projectId,
        role: dto.role,
        userId,
        contractorId: dto.contractorId,
        externalName: dto.externalName,
        externalCompany: dto.externalCompany,
        externalEmail: dto.externalEmail,
        externalPhone: dto.externalPhone,
      },
      include: MEMBER_INCLUDE,
    });
    return setPasswordLink ? { ...member, setPasswordLink } : member;
  }

  private async findOwnedMember(projectId: string, ownerId: string, memberId: string) {
    await this.projectsService.findOneForOwner(projectId, ownerId);
    const member = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId } });
    if (!member) throw new NotFoundException('Project member not found');
    return member;
  }

  async update(projectId: string, ownerId: string, memberId: string, dto: UpdateMemberDto) {
    await this.findOwnedMember(projectId, ownerId, memberId);
    if (dto.contractorId) await this.assertContractorExists(dto.contractorId);
    return this.prisma.projectMember.update({
      where: { id: memberId },
      data: {
        role: dto.role,
        contractorId: dto.contractorId === undefined ? undefined : dto.contractorId,
        externalName: dto.externalName,
        externalCompany: dto.externalCompany,
        externalEmail: dto.externalEmail,
        externalPhone: dto.externalPhone,
      },
      include: MEMBER_INCLUDE,
    });
  }

  async remove(projectId: string, ownerId: string, memberId: string) {
    await this.findOwnedMember(projectId, ownerId, memberId);
    await this.prisma.projectMember.delete({ where: { id: memberId } });
  }
}
