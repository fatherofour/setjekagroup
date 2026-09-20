import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB, matches compliance-records' own limit

// Extends compliance-records' allowlist with common drawing formats — this
// module handles drawings/specs/reports/contracts/correspondence per the
// register, not just compliance certificates. .dwg/.dxf aren't previewable
// in-browser (no CAD rendering library here) so they fall back to
// DocumentPreviewModal's existing "Download to view" path, same as Word/Excel.
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.dwg', '.dxf']);

export function uploadRootDir(): string {
  const dir = process.env.DOCUMENT_UPLOAD_DIR ?? './uploads/project-documents';
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
