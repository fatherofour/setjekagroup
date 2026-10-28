import { createRequire } from 'node:module';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';

/** A page needs OCR when its own text is too thin to search - a scan. */
const MIN_TEXT = 25;
/** Scans are scaled down to this on the long side before OCR: plenty for
 * drawing text, and keeps an A0 scan from taking minutes. */
const OCR_MAX_PX = 4200;

export interface PageText {
  page: number;
  text: string;
  source: 'TEXT' | 'OCR';
}

let worker: Worker | null = null;
let idle: NodeJS.Timeout | null = null;

/** One OCR worker, shared, closed after a minute with nothing to read. */
async function ocrWorker() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    void worker?.terminate();
    worker = null;
  }, 60_000);
  if (!worker) {
    const require = createRequire(import.meta.url);
    const langPath = require.resolve('@tesseract.js-data/eng/package.json').replace(/package\.json$/, '4.0.0_best_int');
    worker = await createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true });
  }
  return worker;
}

const ocrEnabled = () => process.env.FULLTEXT_OCR !== 'off';

export async function ocrImage(png: Buffer): Promise<string> {
  const w = await ocrWorker();
  const r = await w.recognize(png);
  return r.data.text;
}

/** RGBA PNG from a pdf.js image object, scaled down if large. */
async function imageToPng(img: { width: number; height: number; kind: number; data: Uint8ClampedArray | Uint8Array }) {
  const { width, height, data } = img;
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (img.kind === 3) rgba.set(data);
  else if (img.kind === 2) {
    for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
      rgba[q] = data[p];
      rgba[q + 1] = data[p + 1];
      rgba[q + 2] = data[p + 2];
      rgba[q + 3] = 255;
    }
  } else {
    // 1-bit greyscale, packed 8 pixels to a byte, rows padded to a byte.
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const q = (y * width + x) * 4;
        rgba[q] = rgba[q + 1] = rgba[q + 2] = v;
        rgba[q + 3] = 255;
      }
  }
  const full = createCanvas(width, height);
  const ctx = full.getContext('2d');
  const id = ctx.createImageData(width, height);
  id.data.set(rgba);
  ctx.putImageData(id, 0, 0);
  const scale = Math.min(1, OCR_MAX_PX / Math.max(width, height));
  if (scale >= 1) return full.encode('png');
  const small = createCanvas(Math.round(width * scale), Math.round(height * scale));
  small.getContext('2d').drawImage(full, 0, 0, small.width, small.height);
  return small.encode('png');
}

/** Every page's text: the PDF's own where it has some, otherwise OCR of the
 * page's largest embedded image (a scanned sheet is one image a page). */
export async function pdfPages(bytes: Uint8Array): Promise<PageText[]> {
  const pdf = await getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const out: PageText[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => ('str' in i ? i.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= MIN_TEXT || !ocrEnabled()) {
        if (text) out.push({ page: n, text, source: 'TEXT' });
        continue;
      }
      const ops = await page.getOperatorList();
      const names: string[] = [];
      ops.fnArray.forEach((fn, i) => {
        if (fn === OPS.paintImageXObject) names.push(ops.argsArray[i][0] as string);
      });
      let best: { width: number; height: number; kind: number; data: Uint8ClampedArray } | null = null;
      for (const name of names) {
        const img = await new Promise<{ width: number; height: number; kind: number; data: Uint8ClampedArray } | null>((res) => {
          try {
            page.objs.get(name, res);
          } catch {
            res(null);
          }
        });
        if (img?.data && (!best || img.width * img.height > best.width * best.height)) best = img;
      }
      if (best && best.width * best.height > 200_000) {
        const read = (await ocrImage(await imageToPng(best))).replace(/\s+/g, ' ').trim();
        if (read) out.push({ page: n, text: [text, read].filter(Boolean).join(' '), source: 'OCR' });
      } else if (text) out.push({ page: n, text, source: 'TEXT' });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return out;
}
