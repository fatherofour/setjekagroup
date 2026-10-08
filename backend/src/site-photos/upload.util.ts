import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

// Phones are compressed on the device before upload (SitePhotoUploader), so
// this only has to allow for an untouched original from a good camera.
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

// .heic is what iPhones store; Safari shows it, other browsers fall back to
// "Download to view" the same as an unpreviewable document.
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

export function photoRootDir(): string {
  const dir = process.env.PHOTO_UPLOAD_DIR ?? './uploads/site-photos';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function photoFileFilter(_req: Request, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    callback(new BadRequestException(`"${file.originalname}" isn't a photo. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`), false);
    return;
  }
  callback(null, true);
}

export function storedPhotoName(originalName: string): string {
  return `${randomUUID()}${extname(originalName).toLowerCase()}`;
}
