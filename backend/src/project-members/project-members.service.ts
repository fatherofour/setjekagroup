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
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: MEMBER_INCLUDE,
      orderBy: { createdAt: 'asc' },
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
