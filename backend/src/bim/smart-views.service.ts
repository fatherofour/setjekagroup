import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { BimService } from './bim.service.js';
import { SelectionDto } from './rules.js';

export const VIEW_ACTIONS = ['colour', 'transparent', 'hide', 'isolate'] as const;

export class SmartViewRuleDto {
  @IsString() @MinLength(1) @MaxLength(80) label!: string;
  @IsObject() @ValidateNested() @Type(() => SelectionDto) selection!: SelectionDto;
  @IsIn(VIEW_ACTIONS as unknown as string[]) action!: (typeof VIEW_ACTIONS)[number];
  @IsOptional() @Matches(/^#[0-9a-f]{6}$/i) colour?: string;
}

export class SmartViewDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SmartViewRuleDto) rules!: SmartViewRuleDto[];
}

/** Smart views (donor bim_hub smart views): saved, rule-based ways of
 * looking at the models - colour the fire-rated walls red, hide the
 * furniture, isolate level 2 - worked out on the server from the element
 * store and applied by the viewer. */
@Injectable()
export class SmartViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bim: BimService,
  ) {}

  private async team(projectId: string, userId: string) {
    const { client } = await this.bim.viewer(projectId, userId);
    if (client) throw new ForbiddenException('Smart views are kept for the project team');
  }

  async list(projectId: string, userId: string) {
    await this.team(projectId, userId);
    return this.prisma.smartView.findMany({ where: { projectId }, include: { createdBy: { select: { fullName: true } } }, orderBy: { name: 'asc' } });
  }

  async save(projectId: string, userId: string, dto: SmartViewDto, id?: string) {
    await this.team(projectId, userId);
    const name = dto.name.trim();
    const dup = await this.prisma.smartView.findFirst({ where: { projectId, name, ...(id ? { id: { not: id } } : {}) } });
    if (dup) throw new BadRequestException(`There is already a smart view called "${name}"`);
    const data = { name, description: dto.description?.trim() || null, rules: dto.rules.map((r) => ({ ...r, colour: r.colour ?? (r.action === 'colour' ? '#d1453b' : undefined) })) as object };
    if (id) {
      if (!(await this.prisma.smartView.findFirst({ where: { id, projectId } }))) throw new NotFoundException('Smart view not found');
      await this.prisma.smartView.update({ where: { id }, data });
    } else await this.prisma.smartView.create({ data: { ...data, projectId, createdById: userId } });
    return this.list(projectId, userId);
  }

  async remove(projectId: string, userId: string, id: string) {
    await this.team(projectId, userId);
    if (!(await this.prisma.smartView.findFirst({ where: { id, projectId } }))) throw new NotFoundException('Smart view not found');
    await this.prisma.smartView.delete({ where: { id } });
    return this.list(projectId, userId);
  }

  /** What each rule picks, as express ids per model (newest revision), in
   * the order the viewer should apply them. */
  async apply(projectId: string, userId: string, id: string) {
    await this.team(projectId, userId);
    const v = await this.prisma.smartView.findFirst({ where: { id, projectId } });
    if (!v) throw new NotFoundException('Smart view not found');
    const rules = v.rules as unknown as SmartViewRuleDto[];
    const out = [];
    for (const r of rules) {
      const els = await this.bim.selectElements(projectId, r.selection);
      const byModel: Record<string, number[]> = {};
      for (const e of els) (byModel[e.documentId] ??= []).push(e.expressId);
      out.push({ label: r.label, action: r.action, colour: r.colour ?? null, count: els.length, elements: byModel });
    }
    return { id: v.id, name: v.name, rules: out };
  }

  /** How many elements a selection picks, for the editor's live count. */
  async preview(projectId: string, userId: string, selection: SelectionDto) {
    await this.team(projectId, userId);
    const els = await this.bim.selectElements(projectId, selection);
    return { count: els.length, sample: els.slice(0, 10).map((e) => ({ globalId: e.globalId, ifcType: e.ifcType, name: e.name, storey: e.storey })) };
  }
}
