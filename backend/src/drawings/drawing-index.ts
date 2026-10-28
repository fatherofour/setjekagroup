import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { drawingKey } from './title-block.js';

/** One drawing an index or issue sheet says should exist. */
export interface ExpectedDrawing {
  number: string;
  key: string;
  title: string | null;
  revision: string | null;
}

const NUMBER_HEADERS = ['DRAWING NO', 'DWG NO', 'DRG NO', 'SHEET NO', 'DRAWING NUMBER', 'NUMBER', 'NO.', 'DWG', 'DRAWING', 'SHEET', 'REF'];
const TITLE_HEADERS = ['TITLE', 'DESCRIPTION', 'NAME', 'DRAWING TITLE'];
const REV_HEADERS = ['REV', 'REVISION', 'ISSUE'];
const REV_INLINE = /(?:^|\s)rev(?:ision)?\.?\s*(?:no\.?|#|:)?\s*([A-Z0-9]{1,4})\b/i;

/** A drawing number: letters and digits joined by separators, with a digit. */
export const looksLikeNumber = (s: string) => {
  const v = s.trim();
  return v.length >= 2 && v.length <= 40 && /\d/.test(v) && /^[A-Z0-9]+(?:(?:\s?[-_./]\s?|\s)[A-Z0-9]+)*$/i.test(v);
};

const looksLikeRevision = (s: string) => /^[A-Z]{1,2}\d{0,2}$|^\d{1,3}$|^P\d{1,2}$|^C\d{1,2}$/i.test(s.trim());

/** Port of OpenConstructionERP's sheet-index column finder: a header row
 * names the columns; failing that, the number column is the one most full of
 * drawing numbers and the title the widest text column. */
export function identifyColumns(rows: string[][]): { num: number | null; title: number | null; rev: number | null } {
  if (!rows.length) return { num: null, title: null, rev: null };
  let num: number | null = null;
  let title: number | null = null;
  let rev: number | null = null;
  // The first row is a header only if it holds no drawing number itself.
  const header = rows[0].some(looksLikeNumber) ? [] : rows[0];
  header.forEach((c, i) => {
    const h = c.toUpperCase();
    if (rev === null && REV_HEADERS.some((n) => h === n || h.startsWith(`${n} `) || h.startsWith(`${n}.`))) rev = i;
    else if (title === null && TITLE_HEADERS.some((n) => h.includes(n))) title = i;
    else if (num === null && NUMBER_HEADERS.some((n) => h.includes(n))) num = i;
  });
  const width = Math.max(...rows.map((r) => r.length));
  if (num === null) {
    let best = 0;
    for (let c = 0; c < width; c++) {
      const cells = rows.map((r) => r[c] ?? '').filter(Boolean);
      if (!cells.length) continue;
      const ratio = cells.filter(looksLikeNumber).length / cells.length;
      if (ratio > best) {
        best = ratio;
        num = c;
      }
    }
    if (best < 0.3) num = null;
  }
  if (num !== null && title === null) {
    let best = 0;
    for (let c = 0; c < width; c++) {
      if (c === num || c === rev) continue;
      const cells = rows.map((r) => r[c] ?? '').filter(Boolean);
      const avg = cells.length ? cells.reduce((t, x) => t + x.length, 0) / cells.length : 0;
      if (avg > best) {
        best = avg;
        title = c;
      }
    }
    if (best < 4) title = null;
  }
  if (num !== null && rev === null) {
    for (let c = 0; c < width; c++) {
      if (c === num || c === title) continue;
      const cells = rows.slice(1).map((r) => r[c] ?? '').filter(Boolean);
      if (cells.length && cells.filter(looksLikeRevision).length / cells.length > 0.7) {
        rev = c;
        break;
      }
    }
  }
  return { num, title, rev };
}

function fromRows(rows: string[][]): ExpectedDrawing[] {
  const clean = rows.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim())).filter((r) => r.some(Boolean));
  const { num, title, rev } = identifyColumns(clean);
  if (num === null) return [];
  const out = new Map<string, ExpectedDrawing>();
  for (const r of clean) {
    const number = (r[num] ?? '').trim();
    if (!looksLikeNumber(number)) continue;
    const key = drawingKey(number);
    if (!key) continue;
    const t = title !== null ? r[title] || null : null;
    const v = rev !== null && r[rev] ? r[rev] : (r.join(' ').match(REV_INLINE)?.[1] ?? null);
    out.set(key, { number: number.toUpperCase(), key, title: t, revision: v ? v.toUpperCase() : null });
  }
  return [...out.values()];
}

/** A pasted list: CSV, TSV, semicolons, columns lined up with two or more
 * spaces, or "number title [revision]" lines. */
export function fromText(text: string): ExpectedDrawing[] {
  const rows = text.split(/\r?\n/).map((line) => {
    const l = line.trim();
    if (l.includes('\t')) return l.split('\t');
    if (l.includes(';')) return l.split(';');
    if (l.includes(',')) return l.split(',');
    if (/\S\s{2,}\S/.test(l)) return l.split(/\s{2,}/);
    const [first, ...rest] = l.split(/\s+/);
    // A short last word after the title is the revision ("... plan C").
    if (rest.length > 1 && looksLikeRevision(rest[rest.length - 1])) return [first ?? '', rest.slice(0, -1).join(' '), rest[rest.length - 1]];
    return [first ?? '', rest.join(' ')];
  });
  return fromRows(rows);
}

export async function fromExcel(bytes: Buffer): Promise<ExpectedDrawing[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1).map((v) => (v == null ? '' : typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text) : String(v)))));
    const found = fromRows(rows);
    if (found.length) return found;
  }
  return [];
}

/** A PDF drawing index: text runs grouped into lines by height, and into
 * cells where the gap between runs is wide. */
export async function fromPdf(bytes: Uint8Array): Promise<ExpectedDrawing[]> {
  const pdf = await getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const rows: string[][] = [];
  try {
    for (let n = 1; n <= Math.min(pdf.numPages, 20); n++) {
      const page = await pdf.getPage(n);
      const items = (await page.getTextContent()).items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i && Boolean(i.str.trim()))
        .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width, h: Math.max(i.height || Math.hypot(i.transform[0], i.transform[1]), 4) }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: (typeof items)[] = [];
      for (const it of items) {
        const line = lines.find((l) => Math.abs(l[0].y - it.y) < it.h * 0.5);
        if (line) line.push(it);
        else lines.push([it]);
      }
      for (const line of lines) {
        line.sort((a, b) => a.x - b.x);
        const cells: string[] = [];
        let prevEnd = -Infinity;
        for (const it of line) {
          if (it.x - prevEnd > it.h * 1.2 || !cells.length) cells.push(it.s);
          else cells[cells.length - 1] += ` ${it.s}`;
          prevEnd = it.x + it.w;
        }
        rows.push(cells);
      }
    }
  } finally {
    await pdf.destroy();
  }
  return fromRows(rows);
}

export interface RegisterRow {
  id: string;
  number: string;
  title: string;
  revision: string | null;
}

/** The set difference between what the index expects and what is on the
 * register: matched (with any revision difference), missing and extra. */
export function reconcile(expected: ExpectedDrawing[], register: RegisterRow[]) {
  const byKey = new Map(register.map((r) => [drawingKey(r.number)!, r]));
  const expectedKeys = new Set(expected.map((e) => e.key));
  const matched = expected
    .filter((e) => byKey.has(e.key))
    .map((e) => {
      const r = byKey.get(e.key)!;
      const revisionMatches = !e.revision || !r.revision || e.revision.toUpperCase() === r.revision.toUpperCase();
      return { number: e.number, title: e.title ?? r.title, documentId: r.id, expectedRevision: e.revision, registerRevision: r.revision, revisionMatches };
    });
  return {
    expected: expected.length,
    onRegister: register.length,
    matched,
    revisionMismatches: matched.filter((m) => !m.revisionMatches),
    missing: expected.filter((e) => !byKey.has(e.key)),
    extra: register.filter((r) => !expectedKeys.has(drawingKey(r.number)!)),
  };
}
