import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx']);

export function uploadRootDir(): string {
  const dir = process.env.UPLOAD_DIR ?? './uploads/vendor-documents';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function fileFilter(_req: Request, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    callback(new BadRequestException(`Unsupported file type "${ext}". Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`), false);
    return;
  }
  callback(null, true);
}

export function generateStoredName(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  return `${randomUUID()}${ext}`;
}
