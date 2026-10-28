import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { IssuePurpose } from '../generated/prisma/enums.js';

/** What was read off a drawing sheet. The user's decision (26 Oct 2026):
 * the drawing number comes from the architect's own sheet, so the system
 * reads the title block rather than allocating a number. Everything here is
 * a suggestion the uploader confirms. */
export interface TitleBlock {
  drawingNumber: string | null;
  revision: string | null;
  title: string | null;
  scale: string | null;
  date: string | null;
  purpose: IssuePurpose | null;
  purposeText: string | null;
  /** Where the number came from. */
  source: 'TITLE_BLOCK' | 'FILE_NAME' | null;
  pages: number;
  /** False for a scanned sheet with no text to read. */
  hasText: boolean;
}

/** "ARC-101", "arc 101" and "ARC_101" are the same drawing. */
export function drawingKey(n: string | null | undefined) {
  const k = (n ?? '').toUpperCase().replace(/[\s._\-/\\]+/g, '');
  return k || null;
}

interface Text {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 across the sheet and up from the bottom. */
  fx: number;
  fy: number;
}

type Field = 'number' | 'revision' | 'title' | 'scale' | 'date' | 'purpose';

// Title-block labels as South African practices (and most others) print
// them. Matched against a whole text run, label first.
const LABELS: [Field, RegExp][] = [
  ['number', /^(?:drawing|dwg|drg|sheet)\s*\.?\s*(?:no|nr|number|num|#)\b\.?\s*[:.]?\s*(.*)$/i],
  ['number', /^(?:drawing|dwg|drg)\s*(?:ref(?:erence)?|code)\b\.?\s*[:.]?\s*(.*)$/i],
  ['revision', /^(?:rev(?:ision)?)\s*\.?\s*(?:no\b\.?)?\s*[:.]?\s*(.*)$/i],
  ['title', /^(?:drawing|sheet)?\s*title\s*[:.]?\s*(.*)$/i],
  ['title', /^(?:drawing\s*)?description\s*[:.]?\s*(.*)$/i],
  ['scale', /^scale\s*[:.]?\s*(.*)$/i],
  ['date', /^(?:date|issue\s*date)\s*[:.]?\s*(.*)$/i],
  ['purpose', /^(?:status|drawing\s*status|issue\s*status|purpose(?:\s*of\s*issue)?|issued?\s*for|reason\s*for\s*issue)\s*[:.]?\s*(.*)$/i],
];

const PURPOSES: [IssuePurpose, RegExp][] = [
  ['AS_BUILT', /as[\s-]*built|record\s*drawing/i],
  ['FOR_CONSTRUCTION', /construction|\bIFC\b/i],
  ['FOR_PROCUREMENT', /tender|procure|pricing|\bIFT\b/i],
  ['FOR_AUTHORITY_SUBMISSION', /council|municipal|authority|submission|\bSDP\b|statutory|building\s*plan/i],
  ['FOR_CLIENT_APPROVAL', /approval/i],
  ['FOR_COORDINATION', /co-?ordination/i],
  ['FOR_COMMENT', /comment|review/i],
  ['FOR_INFORMATION', /information|\binfo\b|preliminary|sketch|concept/i],
];

export function purposeFrom(text: string | null | undefined): IssuePurpose | null {
  if (!text) return null;
  return PURPOSES.find(([, re]) => re.test(text))?.[0] ?? null;
}

const looksLikeLabel = (s: string) => LABELS.some(([, re]) => re.test(s.trim()) && !re.exec(s.trim())![1]);

// A drawing number: letters and digits joined by separators, with a digit
// somewhere (ARC-DWG-CON-001, 1234-A-101, A101, SK/03).
const NUMBER_TOKEN = /^(?=.*\d)[A-Z0-9]{1,12}(?:[\s]?[-_./][\s]?[A-Z0-9]{1,12}){0,6}$/i;
const NUMBER_IN_TEXT = /\b(?=[A-Z0-9-_./]*\d)[A-Z0-9]{1,8}(?:[-_./][A-Z0-9]{1,8}){1,6}\b/gi;

function cleanValue(field: Field, raw: string) {
  const v = raw.replace(/\s{2,}/g, ' ').replace(/^[:.\s]+|[,;:\s]+$/g, '').trim();
  if (!v) return null;
  if (field === 'number') {
    const compact = v.replace(/\s*([-_./])\s*/g, '$1');
    return NUMBER_TOKEN.test(compact) && compact.length <= 40 ? compact.toUpperCase() : null;
  }
  if (field === 'revision') return /^[A-Z0-9]{1,4}(?:\.\d{1,2})?$/i.test(v) ? v.toUpperCase() : null;
  return v.slice(0, 200);
}

/** The value printed with a label: in the same run ("DWG NO: A101"), to its
 * right on the same line, or in the cell beneath it. */
function valueFor(items: Text[], label: Text, inline: string): string | null {
  if (inline.trim()) return inline;
  const lineTol = Math.max(label.h * 0.6, 2);
  const candidates = items
    .filter((t) => t !== label && t.str.trim() && !looksLikeLabel(t.str))
    .map((t) => {
      const dy = label.y - t.y;
      const sameLine = Math.abs(dy) <= lineTol && t.x > label.x + label.w * 0.5;
      const below = dy > lineTol * 0.5 && dy < label.h * 4.5 && t.x + t.w > label.x - label.h * 2 && t.x < label.x + Math.max(label.w, 40) + label.h * 6;
      if (!sameLine && !below) return null;
      const dist = sameLine ? t.x - (label.x + label.w) : dy * 1.5 + Math.abs(t.x - label.x) * 0.3;
      return { t, dist };
    })
    .filter((c): c is { t: Text; dist: number } => c !== null && c.dist >= -1)
    .sort((a, b) => a.dist - b.dist);
  return candidates[0]?.t.str ?? null;
}

/** Read the title block of page 1. Labels found nearer the bottom right -
 * where title blocks sit - win over the same label elsewhere on the sheet
 * (a revision table, a note). */
async function fromPdf(data: Uint8Array) {
  const pdf = await getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const page = await pdf.getPage(1);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: Text[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const [a, b, , , e, f] = it.transform as number[];
      // Rotated text (a vertical title strip) still has a usable position.
      const h = Math.max(Math.hypot(a, b), 1);
      items.push({ str: it.str, x: e, y: f, w: it.width || h * it.str.length * 0.5, h, fx: e / view.width, fy: f / view.height });
    }
    const found: Partial<Record<Field, { value: string; score: number }>> = {};
    for (const t of items) {
      for (const [field, re] of LABELS) {
        const m = re.exec(t.str.trim());
        if (!m) continue;
        const raw = valueFor(items, t, m[1] ?? '');
        const value = raw ? cleanValue(field, raw) : null;
        if (!value) continue;
        const score = t.fx + (1 - t.fy);
        if (!found[field] || score > found[field]!.score) found[field] = { value, score };
        break;
      }
    }
    // No labelled number: the most number-like token in the title block
    // corner, then anywhere.
    if (!found.number) {
      const corner = items.filter((t) => t.fx > 0.55 && t.fy < 0.35).map((t) => t.str).join(' ');
      for (const text of [corner, items.map((t) => t.str).join(' ')]) {
        const tokens = [...text.matchAll(NUMBER_IN_TEXT)].map((m) => m[0]).filter((s) => !/^\d+([./]\d+)+$/.test(s) && !/^1:\d+$/.test(s));
        tokens.sort((a, b) => b.length - a.length);
        if (tokens[0]) {
          found.number = { value: tokens[0].toUpperCase(), score: 0 };
          break;
        }
      }
    }
    const all = items.map((t) => t.str).join(' ');
    const purposeText = found.purpose?.value ?? all.match(/(?:issued\s+)?for\s+(construction|tender|information|comment|approval|co-?ordination|council\s+submission)/i)?.[0] ?? null;
    return { found, purposeText, pages: pdf.numPages, hasText: items.length > 0 };
  } finally {
    await pdf.destroy();
  }
}

/** From a file name such as "ARC-DWG-CON-001_Rev B - Ground floor.pdf". */
export function fromFileName(name: string) {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  const rev = base.match(/(?:^|[\s_-])rev(?:ision)?[\s._-]*([A-Z0-9]{1,3})(?=$|[\s_.-])/i)?.[1]?.toUpperCase() ?? null;
  const head = base.replace(/(?:^|[\s_-])rev(?:ision)?[\s._-]*[A-Z0-9]{1,3}(?=$|[\s_.-]).*$/i, '');
  const token = head.match(/^\s*([A-Z0-9]+(?:[-_./][A-Z0-9]+)+|[A-Z]{1,4}\d{2,5}[A-Z]?)/i)?.[1] ?? null;
  const number = token && /\d/.test(token) ? token.toUpperCase() : null;
  const title = base.replace(token ?? '', '').replace(/(?:^|[\s_-])rev(?:ision)?[\s._-]*[A-Z0-9]{1,3}(?=$|[\s_.-])/i, ' ').replace(/[_]+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '').trim();
  return { number, revision: rev, title: title || null };
}

export async function readTitleBlock(data: Uint8Array | null, fileName: string): Promise<TitleBlock> {
  const byName = fromFileName(fileName);
  let pdf: Awaited<ReturnType<typeof fromPdf>> | null = null;
  if (data && /\.pdf$/i.test(fileName)) {
    try {
      pdf = await fromPdf(data);
    } catch {
      pdf = null; // unreadable or protected: fall back to the file name
    }
  }
  const f = pdf?.found ?? {};
  const number = f.number?.value ?? byName.number;
  const purposeText = pdf?.purposeText ?? null;
  return {
    drawingNumber: number,
    revision: f.revision?.value ?? byName.revision,
    title: f.title?.value ?? byName.title,
    scale: f.scale?.value ?? null,
    date: f.date?.value ?? null,
    purpose: purposeFrom(purposeText),
    purposeText,
    source: f.number ? 'TITLE_BLOCK' : byName.number ? 'FILE_NAME' : null,
    pages: pdf?.pages ?? 0,
    hasText: pdf?.hasText ?? false,
  };
}
