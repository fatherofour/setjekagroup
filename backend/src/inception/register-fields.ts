import { BadRequestException } from '@nestjs/common';

/** Field specs for the Stage 1 registers. Six registers share one engine
 * (registers.service.ts), so instead of six DTO pairs each register lists
 * its fields here and this whitelists and type-checks the request body —
 * unknown keys are dropped, the same effect as ValidationPipe's whitelist. */
export type FieldSpec =
  | { type: 'string'; required?: boolean; max?: number }
  | { type: 'number'; required?: boolean; min?: number; max?: number; int?: boolean }
  | { type: 'date'; required?: boolean }
  | { type: 'bool'; required?: boolean }
  | { type: 'enum'; values: readonly string[]; required?: boolean }
  // A ProjectMember / ProjectDocument id, checked to belong to the project
  // by the caller (registers.service.ts).
  | { type: 'member'; required?: boolean; defaultToCaller?: boolean }
  | { type: 'document'; required?: boolean }
  // A Contractor id / an OpportunityAppointment on the same opportunity
  // (opportunity-registers.service.ts checks them).
  | { type: 'contractor'; required?: boolean }
  | { type: 'appointment'; required?: boolean };

export type FieldSpecs = Record<string, FieldSpec>;

export function parseFields(specs: FieldSpecs, body: unknown, mode: 'create' | 'update'): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Expected a JSON object');
  const input = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(specs)) {
    const present = Object.prototype.hasOwnProperty.call(input, name) && input[name] !== undefined;
    if (!present) {
      if (mode === 'create' && spec.required) throw new BadRequestException(`${name} is required`);
      continue;
    }
    const raw = input[name];
    if (raw === null || raw === '') {
      if (spec.required) throw new BadRequestException(`${name} is required`);
      out[name] = spec.type === 'bool' ? false : null;
      continue;
    }
    out[name] = parseValue(name, spec, raw);
  }
  return out;
}

function parseValue(name: string, spec: FieldSpec, raw: unknown): unknown {
  switch (spec.type) {
    case 'string': {
      if (typeof raw !== 'string') throw new BadRequestException(`${name} must be text`);
      const value = raw.trim();
      if (spec.required && !value) throw new BadRequestException(`${name} is required`);
      if (value.length > (spec.max ?? 10000)) throw new BadRequestException(`${name} is too long`);
      return value;
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new BadRequestException(`${name} must be a number`);
      if (spec.int && !Number.isInteger(raw)) throw new BadRequestException(`${name} must be a whole number`);
      if (spec.min !== undefined && raw < spec.min) throw new BadRequestException(`${name} must be at least ${spec.min}`);
      if (spec.max !== undefined && raw > spec.max) throw new BadRequestException(`${name} must be at most ${spec.max}`);
      return raw;
    }
    case 'date': {
      if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) throw new BadRequestException(`${name} must be a date`);
      return new Date(raw);
    }
    case 'bool': {
      if (typeof raw !== 'boolean') throw new BadRequestException(`${name} must be true or false`);
      return raw;
    }
    case 'enum': {
      if (typeof raw !== 'string' || !spec.values.includes(raw)) {
        throw new BadRequestException(`${name} must be one of: ${spec.values.join(', ')}`);
      }
      return raw;
    }
    case 'member':
    case 'document':
    case 'contractor':
    case 'appointment': {
      if (typeof raw !== 'string' || !/^[0-9a-f-]{36}$/i.test(raw)) throw new BadRequestException(`${name} must be an id`);
      return raw;
    }
  }
}
