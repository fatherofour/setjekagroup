import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PrismaService } from '../prisma/prisma.service.js';
import { uploadRootDir } from '../project-documents/upload.util.js';
import { ocrImage, pdfPages, type PageText } from './text-extract.js';

const EVERY_MS = 20_000;
const BATCH = 5;

/** Full-text search indexing (donor "file search"): every PDF and image
 * revision's text, page by page, read from the PDF or by OCR of scans. It
 * polls rather than hooks the uploads, so revisions from any route - and
 * ones uploaded before this existed - are picked up. FULLTEXT_INDEXING=off
 * turns it off; FULLTEXT_OCR=off skips OCR. */
@Injectable()
export class TextIndexService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('TextIndex');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.FULLTEXT_INDEXING === 'off') return;
    // A revision left mid-way by a restart is read again.
    void this.prisma.documentRevision.updateMany({ where: { textStatus: 'PROCESSING' }, data: { textStatus: null } }).catch(() => undefined);
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    setTimeout(() => void this.run(), 5_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Read the next few revisions not yet indexed. */
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const todo = await this.prisma.documentRevision.findMany({
        where: { textStatus: null, document: { deletedAt: null } },
        select: { id: true, storedFilename: true, originalFilename: true, mimeType: true },
        orderBy: { uploadedAt: 'desc' },
        take: BATCH,
      });
      for (const r of todo) await this.index(r);
    } finally {
      this.running = false;
    }
  }

  async index(r: { id: string; storedFilename: string; originalFilename: string; mimeType: string }) {
    const isPdf = r.mimeType === 'application/pdf' || /\.pdf$/i.test(r.originalFilename);
    const isImage = /^image\/(png|jpe?g)$/.test(r.mimeType);
    if (!isPdf && !isImage) {
      await this.prisma.documentRevision.update({ where: { id: r.id }, data: { textStatus: 'SKIPPED' } });
      return;
    }
    const path = join(uploadRootDir(), r.storedFilename);
    if (!existsSync(path)) {
      await this.prisma.documentRevision.update({ where: { id: r.id }, data: { textStatus: 'FAILED' } });
      return;
    }
    await this.prisma.documentRevision.update({ where: { id: r.id }, data: { textStatus: 'PROCESSING' } });
    try {
      let pages: PageText[];
      if (isPdf) pages = await pdfPages(new Uint8Array(readFileSync(path)));
      else {
        const img = await loadImage(readFileSync(path));
        const scale = Math.min(1, 4200 / Math.max(img.width, img.height));
        const c = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const text = process.env.FULLTEXT_OCR === 'off' ? '' : (await ocrImage(await c.encode('png'))).replace(/\s+/g, ' ').trim();
        pages = text ? [{ page: 1, text, source: 'OCR' }] : [];
      }
      await this.prisma.$transaction([
        this.prisma.documentPageText.deleteMany({ where: { revisionId: r.id } }),
        this.prisma.documentPageText.createMany({ data: pages.map((p) => ({ revisionId: r.id, page: p.page, text: p.text.slice(0, 200_000), source: p.source })) }),
        this.prisma.documentRevision.update({ where: { id: r.id }, data: { textStatus: pages.length ? 'DONE' : 'NONE' } }),
      ]);
    } catch (e) {
      this.log.warn(`Could not read ${r.originalFilename}: ${e instanceof Error ? e.message : e}`);
      await this.prisma.documentRevision.update({ where: { id: r.id }, data: { textStatus: 'FAILED' } }).catch(() => undefined);
    }
  }
}
