import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { BimService } from './bim.service.js';
import { parseIds, parseRequirementSheet, type Requirement } from './ids.js';
import { ConditionDto, SelectionDto, fieldValue, test, type ElementLike } from './rules.js';

export class RequirementDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsObject() @ValidateNested() @Type(() => SelectionDto) applicability!: SelectionDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ConditionDto) checks!: ConditionDto[];
}

export class RequirementSetDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => RequirementDto) requirements!: RequirementDto[];
}

export class RunCheckDto {
  @IsUUID() revisionId!: string;
}

/** IFC2X3 splits some classes into "standard case" subclasses; a
 * requirement on IFCWALL means those too. */
const typeMatches = (want: string[] | undefined, type: string) => {
  const got = type.toUpperCase();
  return !want?.length || want.some((w) => got === w || (got.startsWith(w) && /^(STANDARDCASE|ELEMENTEDCASE)$/.test(got.slice(w.length))));
};

/** BIM requirements (donor bim_requirements): what the models must carry -
 * imported from an IDS file or a spreadsheet, or written here - checked
 * against a model revision, element by element, with a score. */
@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bim: BimService,
  ) {}

  private async team(projectId: string, userId: string) {
    const { client } = await this.bim.viewer(projectId, userId);
    if (client) throw new ForbiddenException('BIM requirements are kept for the project team');
  }

  async list(projectId: string, userId: string) {
    await this.team(projectId, userId);
    const sets = await this.prisma.bimRequirementSet.findMany({
      where: { projectId },
      include: {
        createdBy: { select: { fullName: true } },
        checks: { orderBy: { ranAt: 'desc' }, take: 10, select: { id: true, score: true, ranAt: true, revisionId: true, revision: { select: { revisionNumber: true, document: { select: { id: true, name: true } } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return sets;
  }

  private async store(projectId: string, userId: string, name: string, source: string, fileName: string | null, requirements: Requirement[]) {
    const set = await this.prisma.bimRequirementSet.create({ data: { projectId, name: name.trim().slice(0, 120), source, fileName, requirements: requirements as unknown as object, createdById: userId } });
    return set;
  }

  async import(projectId: string, userId: string, file: Express.Multer.File, name?: string) {
    await this.team(projectId, userId);
    const ext = file.originalname.toLowerCase().split('.').pop();
    try {
      if (ext === 'ids' || ext === 'xml') {
        const out = parseIds(file.buffer.toString('utf8'));
        const set = await this.store(projectId, userId, name || out.title || file.originalname.replace(/\.[^.]+$/, ''), 'IDS', file.originalname, out.requirements);
        return { id: set.id, requirements: out.requirements.length, skipped: out.skipped };
      }
      if (ext === 'xlsx' || ext === 'csv') {
        const out = await parseRequirementSheet(file.buffer, ext === 'csv');
        const set = await this.store(projectId, userId, name || file.originalname.replace(/\.[^.]+$/, ''), 'EXCEL', file.originalname, out.requirements);
        return { id: set.id, requirements: out.requirements.length, skipped: out.skipped };
      }
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'The file could not be read');
    }
    throw new BadRequestException('Upload an IDS (.ids), Excel (.xlsx) or CSV file');
  }

  async save(projectId: string, userId: string, dto: RequirementSetDto, id?: string) {
    await this.team(projectId, userId);
    const requirements: Requirement[] = dto.requirements.map((r, i) => ({
      id: `R${String(i + 1).padStart(3, '0')}`,
      name: r.name.trim(),
      description: r.description?.trim() || undefined,
      applicability: { ifcTypes: r.applicability.ifcTypes?.map((t) => t.toUpperCase()), conditions: r.applicability.conditions },
      checks: r.checks,
    }));
    if (id) {
      const s = await this.prisma.bimRequirementSet.findFirst({ where: { id, projectId } });
      if (!s) throw new NotFoundException('Requirement set not found');
      await this.prisma.bimRequirementSet.update({ where: { id }, data: { name: dto.name.trim(), requirements: requirements as unknown as object } });
      return { id };
    }
    const set = await this.store(projectId, userId, dto.name, 'MANUAL', null, requirements);
    return { id: set.id };
  }

  async get(projectId: string, userId: string, id: string) {
    await this.team(projectId, userId);
    const s = await this.prisma.bimRequirementSet.findFirst({ where: { id, projectId } });
    if (!s) throw new NotFoundException('Requirement set not found');
    return s;
  }

  async remove(projectId: string, userId: string, id: string) {
    await this.get(projectId, userId, id);
    await this.prisma.bimRequirementSet.delete({ where: { id } });
  }

  async run(projectId: string, userId: string, id: string, revisionId: string) {
    const set = await this.get(projectId, userId, id);
    const proc = await this.prisma.bimProcessing.findFirst({ where: { revisionId, revision: { document: { projectId, deletedAt: null } } } });
    if (!proc) throw new NotFoundException('Model revision not found');
    if (proc.status !== 'DONE') throw new BadRequestException('The model is still being read; try again shortly');
    const els = (await this.prisma.bimElement.findMany({ where: { revisionId } })) as unknown as (ElementLike & { name: string | null })[];
    const reqs = set.requirements as unknown as Requirement[];
    let applicable = 0;
    let passed = 0;
    const results = reqs.map((r) => {
      const scope = els.filter((e) => typeMatches(r.applicability.ifcTypes, e.ifcType) && (r.applicability.conditions ?? []).every((c) => test(e, c)));
      const failing: { globalId: string; name: string | null; ifcType: string; problems: string[] }[] = [];
      for (const e of scope) {
        const problems = r.checks.filter((c) => !test(e, c)).map((c) => {
          const v = fieldValue(e, c.field);
          const f = c.field.replace(/^(property|quantity):/, '');
          return v == null || v === '' ? `${f} is missing` : `${f} is "${v}"`;
        });
        if (problems.length) failing.push({ globalId: e.globalId, name: e.name, ifcType: e.ifcType, problems });
      }
      applicable += scope.length;
      passed += scope.length - failing.length;
      return { requirementId: r.id, name: r.name, applicable: scope.length, passed: scope.length - failing.length, failed: failing.length, failing: failing.slice(0, 300) };
    });
    const score = applicable ? Math.round((passed / applicable) * 1000) / 10 : 0;
    const check = await this.prisma.bimRequirementCheck.create({ data: { setId: id, revisionId, results: results as unknown as object, score } });
    return { id: check.id, score, applicable, passed, results };
  }

  async check(projectId: string, userId: string, checkId: string) {
    await this.team(projectId, userId);
    const c = await this.prisma.bimRequirementCheck.findFirst({ where: { id: checkId, set: { projectId } }, include: { set: { select: { name: true } }, revision: { select: { revisionNumber: true, documentId: true, document: { select: { name: true } } } } } });
    if (!c) throw new NotFoundException('Check not found');
    return c;
  }
}
