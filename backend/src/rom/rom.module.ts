import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Injectable, Module, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProjectsService } from '../projects/projects.service.js';

export const QUALITIES = ['ECONOMY', 'STANDARD', 'PRESTIGE'] as const;
const VAT = 0.15;

/** How a building's cost usually splits by element (percent of the
 * construction cost). Indicative only - enough to show where the money
 * goes in a rough estimate. */
const SPLITS: Record<string, [string, number][]> = {
  DEFAULT: [
    ['Preliminaries and general', 8],
    ['Substructure', 7],
    ['Frame and upper floors', 15],
    ['Roof', 6],
    ['External walls, windows and doors', 13],
    ['Internal walls and doors', 8],
    ['Finishes', 11],
    ['Fittings and furniture', 4],
    ['Services (mechanical, electrical, plumbing)', 21],
    ['External works', 7],
  ],
  INDUSTRIAL: [
    ['Preliminaries and general', 8],
    ['Substructure and surface bed', 14],
    ['Steel frame', 20],
    ['Roof and cladding', 22],
    ['Internal walls and doors', 4],
    ['Finishes', 4],
    ['Services (mechanical, electrical, plumbing)', 14],
    ['External works and yards', 14],
  ],
  PARKING: [
    ['Preliminaries and general', 8],
    ['Substructure', 12],
    ['Frame and decks', 45],
    ['Ramps, barriers and finishes', 10],
    ['Services (lighting, ventilation, drainage, fire)', 15],
    ['External works', 10],
  ],
  HEALTHCARE: [
    ['Preliminaries and general', 8],
    ['Substructure', 5],
    ['Frame and upper floors', 12],
    ['Roof', 4],
    ['External walls, windows and doors', 10],
    ['Internal walls and doors', 9],
    ['Finishes', 10],
    ['Fittings and equipment', 7],
    ['Services (mechanical, electrical, medical gases)', 30],
    ['External works', 5],
  ],
};

export class RomInputDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsString() @MaxLength(40) buildingType!: string;
  @IsIn(QUALITIES as unknown as string[]) quality!: (typeof QUALITIES)[number];
  @IsString() @MaxLength(40) region!: string;
  @IsNumber() @Min(10) @Max(5_000_000) gfa!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) escalationPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(50) contingencyPct?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RomRateDto {
  @IsNumber() @Min(100) @Max(1_000_000) ratePerM2!: number;
}

export class RomRegionDto {
  @IsNumber() @Min(0.5) @Max(2) factor!: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The rough order-of-magnitude estimate (donor "rough cost estimate"):
 * gross floor area x a rate per m2 for the building type and quality,
 * adjusted for the province, escalated to the build date, with a
 * contingency and VAT, and split into elements. Setjeka keeps the rate
 * table; each estimate records the rate it used. */
@Injectable()
export class RomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async table() {
    const [rates, regions] = await Promise.all([
      this.prisma.romRate.findMany({ orderBy: [{ label: 'asc' }, { ratePerM2: 'asc' }], include: { updatedBy: { select: { fullName: true } } } }),
      this.prisma.romRegionFactor.findMany({ orderBy: { region: 'asc' } }),
    ]);
    return { rates, regions, qualities: QUALITIES, vat: VAT };
  }

  async setRate(userId: string, id: string, dto: RomRateDto) {
    if (!(await this.prisma.romRate.findUnique({ where: { id } }))) throw new NotFoundException('Rate not found');
    await this.prisma.romRate.update({ where: { id }, data: { ratePerM2: dto.ratePerM2, updatedById: userId } });
    return this.table();
  }

  async setRegion(id: string, dto: RomRegionDto) {
    if (!(await this.prisma.romRegionFactor.findUnique({ where: { id } }))) throw new NotFoundException('Region not found');
    await this.prisma.romRegionFactor.update({ where: { id }, data: { factor: dto.factor } });
    return this.table();
  }

  async calculate(dto: RomInputDto) {
    const rate = await this.prisma.romRate.findUnique({ where: { buildingType_quality: { buildingType: dto.buildingType, quality: dto.quality } } });
    if (!rate) throw new BadRequestException('Choose a building type and quality from the rate table');
    const region = await this.prisma.romRegionFactor.findUnique({ where: { region: dto.region } });
    if (!region) throw new BadRequestException('Choose a province from the list');
    const escalationPct = dto.escalationPct ?? 0;
    const contingencyPct = dto.contingencyPct ?? 10;
    const construction = dto.gfa * rate.ratePerM2 * region.factor;
    const escalation = construction * (escalationPct / 100);
    const contingency = (construction + escalation) * (contingencyPct / 100);
    const net = construction + escalation + contingency;
    const vat = net * VAT;
    const split = SPLITS[dto.buildingType] ?? SPLITS.DEFAULT;
    const elements = split.map(([element, pct]) => ({ element, pct, amount: r2((construction * pct) / 100), perM2: r2((rate.ratePerM2 * region.factor * pct) / 100) }));
    return {
      buildingType: rate.buildingType,
      label: rate.label,
      quality: rate.quality,
      region: region.region,
      gfa: dto.gfa,
      baseRate: rate.ratePerM2,
      regionFactor: region.factor,
      escalationPct,
      contingencyPct,
      currency: rate.currency,
      elements,
      construction: r2(construction),
      escalation: r2(escalation),
      contingency: r2(contingency),
      net: r2(net),
      vat: r2(vat),
      total: r2(net + vat),
      ratePerM2All: r2((net + vat) / dto.gfa),
    };
  }

  private async scope(userId: string, dto: { projectId?: string; opportunityId?: string }) {
    if (dto.projectId && dto.opportunityId) throw new BadRequestException('An estimate belongs to a project or an opportunity, not both');
    if (dto.projectId) await this.projects.findOneForOwner(dto.projectId, userId);
    if (dto.opportunityId && !(await this.prisma.opportunity.findUnique({ where: { id: dto.opportunityId } }))) throw new NotFoundException('Opportunity not found');
  }

  async save(userId: string, dto: RomInputDto) {
    if (!dto.projectId && !dto.opportunityId) throw new BadRequestException('Save the estimate against a project or an opportunity');
    await this.scope(userId, dto);
    const c = await this.calculate(dto);
    const est = await this.prisma.romEstimate.create({
      data: {
        projectId: dto.projectId ?? null,
        opportunityId: dto.opportunityId ?? null,
        name: dto.name?.trim() || `${c.label}, ${c.quality.toLowerCase()}, ${c.gfa.toLocaleString('en-ZA')} m²`,
        buildingType: c.buildingType,
        quality: c.quality,
        region: c.region,
        gfa: c.gfa,
        baseRate: c.baseRate,
        regionFactor: c.regionFactor,
        escalationPct: c.escalationPct,
        contingencyPct: c.contingencyPct,
        total: c.total,
        currency: c.currency,
        breakdown: c as unknown as object,
        notes: dto.notes?.trim() || null,
        createdById: userId,
      },
    });
    return est;
  }

  async list(userId: string, q: { projectId?: string; opportunityId?: string }) {
    await this.scope(userId, q);
    return this.prisma.romEstimate.findMany({
      where: { ...(q.projectId ? { projectId: q.projectId } : {}), ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}) },
      include: { createdBy: { select: { fullName: true } }, project: { select: { id: true, name: true, projectCode: true } }, opportunity: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async remove(userId: string, id: string) {
    const e = await this.prisma.romEstimate.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Estimate not found');
    await this.scope(userId, { projectId: e.projectId ?? undefined });
    await this.prisma.romEstimate.delete({ where: { id } });
  }
}

/** Rough estimates are Setjeka's own early-stage advice, before a bill of
 * quantities exists - internal staff only. */
@Controller('rom')
@UseGuards(JwtAccessGuard, InternalOnlyGuard)
export class RomController {
  constructor(private readonly rom: RomService) {}

  @Get('rates')
  table() {
    return this.rom.table();
  }

  @Patch('rates/:id')
  setRate(@Param('id') id: string, @Body() dto: RomRateDto, @CurrentUser() user: JwtPayload) {
    return this.rom.setRate(user.sub, id, dto);
  }

  @Patch('regions/:id')
  setRegion(@Param('id') id: string, @Body() dto: RomRegionDto) {
    return this.rom.setRegion(id, dto);
  }

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  calculate(@Body() dto: RomInputDto) {
    return this.rom.calculate(dto);
  }

  @Get('estimates')
  list(@Query('projectId') projectId: string | undefined, @Query('opportunityId') opportunityId: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.rom.list(user.sub, { projectId, opportunityId });
  }

  @Post('estimates')
  save(@Body() dto: RomInputDto, @CurrentUser() user: JwtPayload) {
    return this.rom.save(user.sub, dto);
  }

  @Delete('estimates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.rom.remove(user.sub, id);
  }
}

@Module({
  imports: [ProjectsModule],
  controllers: [RomController],
  providers: [RomService],
})
export class RomModule {}
