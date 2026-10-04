import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DeliverablesService } from './deliverables.service.js';
import { parseFields } from './register-fields.js';
import { REGISTERS, type RegisterConfig } from './registers.js';
import { computeViability } from './viability.js';
import { MILESTONE_TEMPLATE, milestoneStatus } from '../opportunities/milestones.js';

type Delegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<unknown>;
};

/** One engine for the Stage 1 registers (site constraints, investigations,
 * consents, information, required services, viability scenarios). Each
 * register's fields and side effects are declared in registers.ts. */
@Injectable()
export class RegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliverables: DeliverablesService,
  ) {}

  private config(register: string): RegisterConfig {
    const config = REGISTERS[register];
    if (!config) throw new NotFoundException('Unknown register');
    return config;
  }

  private delegate(config: RegisterConfig): Delegate {
    return this.prisma[config.model] as unknown as Delegate;
  }

  private decorate(register: string, row: Record<string, unknown>) {
    if (register === 'milestones') return { ...row, ...milestoneStatus(row as never) };
    if (register !== 'viability') return row;
    return { ...row, result: computeViability(row as unknown as Parameters<typeof computeViability>[0]) };
  }

  async addMilestoneTemplate(projectId: string) {
    const existing = await this.prisma.developmentMilestone.findMany({ where: { projectId }, select: { key: true } });
    const have = new Set(existing.map((m) => m.key));
    const max = await this.prisma.developmentMilestone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    let sort = (max._max.sortOrder ?? 0) + 1;
    await this.prisma.developmentMilestone.createMany({
      data: MILESTONE_TEMPLATE.filter((t) => !have.has(t.key)).map((t) => ({ projectId, key: t.key, name: t.name, sortOrder: sort++ })),
    });
    return this.findAll(projectId, 'milestones');
  }

  async baselineMilestones(projectId: string) {
    const rows = await this.prisma.developmentMilestone.findMany({ where: { projectId, baselineDate: null, targetDate: { not: null } } });
    await this.prisma.$transaction(rows.map((m) => this.prisma.developmentMilestone.update({ where: { id: m.id }, data: { baselineDate: m.targetDate } })));
    return this.findAll(projectId, 'milestones');
  }

  async findAll(projectId: string, register: string) {
    const config = this.config(register);
    const rows = await this.delegate(config).findMany({ where: { projectId }, include: config.include, orderBy: config.orderBy });
    return rows.map((r) => this.decorate(register, r));
  }

  private async findOne(projectId: string, register: string, id: string) {
    const config = this.config(register);
    const row = await this.delegate(config).findFirst({ where: { id, projectId }, include: config.include });
    if (!row) throw new NotFoundException('Record not found');
    return this.decorate(register, row);
  }

  /** Member and document ids must belong to this project. */
  private async assertRefs(projectId: string, config: RegisterConfig, data: Record<string, unknown>) {
    for (const [name, spec] of Object.entries(config.fields)) {
      const id = data[name];
      if (typeof id !== 'string') continue;
      if (spec.type === 'member') {
        const found = await this.prisma.projectMember.count({ where: { id, projectId } });
        if (!found) throw new BadRequestException(`${name}: team member not found on this project`);
      } else if (spec.type === 'document') {
        const found = await this.prisma.projectDocument.count({ where: { id, projectId } });
        if (!found) throw new BadRequestException(`${name}: document not found on this project`);
      }
    }
  }

  async create(projectId: string, register: string, userId: string, body: unknown) {
    const config = this.config(register);
    const data = parseFields(config.fields, body, 'create');

    // Attribute the record to the caller's own team membership by default,
    // so PROCSA "advise on ..." items credit the right role.
    const defaultable = Object.entries(config.fields).filter(([name, spec]) => spec.type === 'member' && spec.defaultToCaller && data[name] === undefined);
    if (defaultable.length) {
      const own = await this.prisma.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } });
      if (own) for (const [name] of defaultable) data[name] = own.id;
    }

    await this.assertRefs(projectId, config, data);
    if (config.createdByField) data[config.createdByField] = userId;

    let created: Record<string, unknown>;
    try {
      created = await this.delegate(config).create({ data: { ...data, projectId } });
    } catch (err) {
      throw this.mapConflict(err);
    }
    if (config.deliverable) await this.deliverables.touch(projectId, config.deliverable, userId);
    return this.findOne(projectId, register, created.id as string);
  }

  async update(projectId: string, register: string, id: string, userId: string, body: unknown) {
    const config = this.config(register);
    await this.findOne(projectId, register, id);
    const data = parseFields(config.fields, body, 'update');
    await this.assertRefs(projectId, config, data);
    try {
      await this.delegate(config).update({ where: { id }, data });
    } catch (err) {
      throw this.mapConflict(err);
    }
    if (config.deliverable) await this.deliverables.touch(projectId, config.deliverable, userId);
    return this.findOne(projectId, register, id);
  }

  async remove(projectId: string, register: string, id: string, userId: string) {
    const config = this.config(register);
    await this.findOne(projectId, register, id);
    await this.delegate(config).delete({ where: { id } });
    if (config.deliverable) await this.deliverables.touch(projectId, config.deliverable, userId);
  }

  private mapConflict(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('That entry already exists on this project');
    }
    return err;
  }
}
