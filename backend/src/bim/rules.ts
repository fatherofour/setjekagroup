import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

/** The shared rule language for clash selections, smart views and
 * requirement checks: a condition tests one element field, property or
 * quantity. Fields: ifcType, name, typeName, storey, material, globalId,
 * "property:<Set.Name>" or "quantity:<Set.Name>". */
export const OPS = ['eq', 'neq', 'contains', 'notContains', 'startsWith', 'exists', 'notExists', 'gt', 'lt', 'in', 'matches'] as const;
export type Op = (typeof OPS)[number];

export class ConditionDto {
  @IsString() @MaxLength(200) field!: string;
  @IsIn(OPS as unknown as string[]) op!: Op;
  @IsOptional() @IsString() @MaxLength(1000) value?: string;
}

/** Which elements: from which models, of which types, on which storeys,
 * and meeting every condition. */
export class SelectionDto {
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) documentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) ifcTypes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) storeys?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ConditionDto) conditions?: ConditionDto[];
}

export interface ElementLike {
  globalId: string;
  documentId: string;
  ifcType: string;
  name: string | null;
  typeName: string | null;
  storey: string | null;
  material: string | null;
  properties: unknown;
  quantities: unknown;
}

export function fieldValue(e: ElementLike, field: string): string | number | boolean | null {
  if (field.startsWith('property:')) return ((e.properties as Record<string, string | number | boolean>) ?? {})[field.slice(9)] ?? null;
  if (field.startsWith('quantity:')) return ((e.quantities as Record<string, number>) ?? {})[field.slice(9)] ?? null;
  switch (field) {
    case 'ifcType':
      return e.ifcType;
    case 'name':
      return e.name;
    case 'typeName':
      return e.typeName;
    case 'storey':
      return e.storey;
    case 'material':
      return e.material;
    case 'globalId':
      return e.globalId;
    default:
      return null;
  }
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

export function test(e: ElementLike, c: { field: string; op: Op; value?: string }): boolean {
  const v = fieldValue(e, c.field);
  const want = c.value ?? '';
  switch (c.op) {
    case 'exists':
      return v !== null && v !== '';
    case 'notExists':
      return v === null || v === '';
    case 'eq':
      return v !== null && (typeof v === 'boolean' ? String(v) === norm(want) : norm(v) === norm(want));
    case 'neq':
      return v === null || norm(v) !== norm(want);
    case 'contains':
      return v !== null && norm(v).includes(norm(want));
    case 'notContains':
      return v === null || !norm(v).includes(norm(want));
    case 'startsWith':
      return v !== null && norm(v).startsWith(norm(want));
    case 'gt':
      return v !== null && Number(v) > Number(want);
    case 'lt':
      return v !== null && Number(v) < Number(want);
    case 'in':
      return v !== null && want.split(/[,;|]/).map(norm).includes(norm(v));
    case 'matches':
      try {
        return v !== null && new RegExp(want, 'i').test(String(v));
      } catch {
        return false;
      }
  }
}

export function selects(e: ElementLike, s: SelectionDto | undefined | null): boolean {
  if (!s) return true;
  if (s.documentIds?.length && !s.documentIds.includes(e.documentId)) return false;
  if (s.ifcTypes?.length && !s.ifcTypes.some((t) => t.toLowerCase() === e.ifcType.toLowerCase())) return false;
  if (s.storeys?.length && !s.storeys.includes(e.storey ?? '')) return false;
  return (s.conditions ?? []).every((c) => test(e, c));
}
