import { Body, Controller, Get, Injectable, Module, Put, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ProjectMemberRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';

/**
 * Who the in-app guide speaks to. Setjeka staff get the Setjeka guide whatever
 * project role they hold; an outside party gets the guide for the role they
 * hold on their projects.
 */
export type GuidePersona = 'setjeka' | 'architect' | 'engineer' | 'qs' | 'contractor' | 'client' | 'consultant' | 'site' | 'vendor';

const ENGINEERS: ProjectMemberRole[] = ['STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER'];

export function personaFor(user: { role: string; accountType: string; clientId: string | null; contractorId: string | null }, roles: ProjectMemberRole[]): GuidePersona {
  if (user.role === 'ADMIN' || user.accountType === 'INTERNAL') return 'setjeka';
  if (user.clientId || roles.includes('CLIENT')) return 'client';
  if (roles.includes('ARCHITECT') || roles.includes('ARCHITECT_ENGINEER')) return 'architect';
  if (roles.some((r) => ENGINEERS.includes(r))) return 'engineer';
  if (roles.includes('QUANTITY_SURVEYOR')) return 'qs';
  if (roles.includes('CONTRACTOR')) return 'contractor';
  // An outside site or HSE manager: the site team, not "the consultant"
  // (critique V3-L-02).
  if (roles.some((r) => r === 'SITE_MANAGER' || r === 'HSE_MANAGER' || r === 'QA_QC_MANAGER')) return 'site';
  if (roles.length === 0 && user.contractorId) return 'vendor';
  return 'consultant';
}

interface GuideState {
  seen?: string[];
  off?: boolean;
}

class GuideUpdateDto {
  /** Keys to add to what has been seen. */
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(80, { each: true }) seen?: string[];
  /** true turns screen tips off; false turns them back on. */
  @IsOptional() @IsBoolean() off?: boolean;
  /** Starts the guide again from the welcome tour. */
  @IsOptional() @IsBoolean() reset?: boolean;
}

@Injectable()
export class GuideService {
  constructor(private readonly prisma: PrismaService) {}

  /** `projectId`: the project in front of them. Their role there decides
   * the persona when they're on it, so the client on one project and a
   * contractor on another gets the right guide on each (critique V3-L-02). */
  async get(userId: string, projectId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, accountType: true, clientId: true, contractorId: true, guideState: true, projectMemberOf: { select: { role: true, projectId: true } } },
    });
    const here = projectId ? user.projectMemberOf.filter((m) => m.projectId === projectId) : [];
    const roles = [...new Set((here.length ? here : user.projectMemberOf).map((m) => m.role))];
    const state = (user.guideState ?? {}) as GuideState;
    return { persona: personaFor(user, roles), roles, seen: state.seen ?? [], off: state.off ?? false };
  }

  async update(userId: string, dto: GuideUpdateDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { guideState: true } });
    const state = (user.guideState ?? {}) as GuideState;
    const next: GuideState = dto.reset ? { seen: [], off: false } : { seen: [...new Set([...(state.seen ?? []), ...(dto.seen ?? [])])].slice(-300), off: dto.off ?? state.off ?? false };
    await this.prisma.user.update({ where: { id: userId }, data: { guideState: next as object } });
    return this.get(userId);
  }
}

/** The signed-in person's guide: their persona and what they've seen. */
@Controller('me/guide')
@UseGuards(JwtAccessGuard)
export class GuideController {
  constructor(private readonly guide: GuideService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string) {
    return this.guide.get(user.sub, projectId || undefined);
  }

  @Put()
  update(@CurrentUser() user: JwtPayload, @Body() dto: GuideUpdateDto) {
    return this.guide.update(user.sub, dto);
  }
}

@Module({
  controllers: [GuideController],
  providers: [GuideService],
})
export class GuideModule {}
