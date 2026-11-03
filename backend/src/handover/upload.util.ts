import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

// Within the server's 30 MB request limit (deploy/nginx.conf); a large
// as-built set goes up as a few files or a zip.
export const MAX_HANDOVER_BYTES = 30 * 1024 * 1024;

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.ifc', '.zip', '.jpg', '.jpeg', '.png']);

export function handoverRootDir(): string {
  const dir = process.env.HANDOVER_UPLOAD_DIR ?? './uploads/handover';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function handoverFileFilter(_req: Request, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED.has(ext)) {
    callback(new BadRequestException(`"${file.originalname}" can't be handed over. Allowed: ${Array.from(ALLOWED).join(', ')}`), false);
    return;
  }
  callback(null, true);
}

export const storedHandoverName = (originalName: string) => `${randomUUID()}${extname(originalName).toLowerCase()}`;
