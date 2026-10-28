import ExcelJS from 'exceljs';
import type { CostPlanItemType } from '../generated/prisma/enums.js';
import { round } from '../cost-database/pricing.js';

/** Reading a bill of quantities from the QS's own system (register COM "BOQ
 * can be imported"): an Excel workbook or a CSV with a heading row naming
 * the description, unit, quantity, rate and amount columns, in whatever
 * order and wording the QS's software uses. A row with a description and no
 * figures starts a new bill or element; collection and carried-forward rows
 * are skipped; provisional, prime-cost and daywork sums are recognised by
 * their wording. */

export interface ImportedItem {
  section: string | null;
  ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number;
  type: CostPlanItemType;
}

const cellText = (v: unknown): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText((v as { result: unknown }).result);
    if ('richText' in v) return ((v as { richText: { text: string }[] }).richText ?? []).map((t) => t.text).join('');
    if ('text' in v) return String((v as { text: unknown }).text);
    return '';
  }
  return String(v);
};

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' || ch === ';' || ch === '\t') cells.push(cur), (cur = '');
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

async function workbookRows(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  // The first sheet with a description heading; bills often start with a
  // cover or summary sheet.
  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    ws.eachRow((row) => {
      const values = row.values as unknown[];
      rows.push(Array.from({ length: Math.max(values.length - 1, 0) }, (_, i) => cellText(values[i + 1]).trim()));
    });
    if (rows.slice(0, 40).some((r) => r.some((c) => /descr/i.test(c)))) return rows;
  }
  throw new Error('No sheet has a heading row with a Description column');
}

/** "1 234,50", "1,234.50", "R 1 234.50" and "(500)" all read as numbers. */
export function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d,.()-]/g, '');
  if (!/\d/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

const SKIP = /^(total|sub-?total|carried|brought|collection|to collection|summary|page total)\b/i;

function typeOf(description: string): CostPlanItemType {
  if (/prime\s*cost|\bp\.?\s?c\.?\s*sum/i.test(description)) return 'PRIME_COST_SUM';
  if (/provisional\s*sum|\bprov\.?\s*sum/i.test(description)) return 'PROVISIONAL_SUM';
  if (/daywork/i.test(description)) return 'DAYWORK';
  return 'MEASURED';
}

export async function readBoq(buffer: Buffer, filename: string): Promise<{ items: ImportedItem[]; skipped: string[] }> {
  const rows = /\.(csv|txt)$/i.test(filename) ? csvRows(buffer.toString('utf8')) : await workbookRows(buffer);
  const headIdx = rows.findIndex((r) => r.some((c) => /descr/i.test(c)));
  if (headIdx < 0) throw new Error('No heading row with a Description column was found');
  const head = rows[headIdx].map((h) => h.toLowerCase());
  const col = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const cDesc = col(/descr/);
  const cRef = col(/^(item|ref|no\.?|nr|code|clause)/);
  const cUnit = col(/^unit|uom/, /rate|price/);
  const cQty = col(/qty|quant/);
  const cRate = col(/rate|unit\s*price|price/);
  const cAmount = col(/amount|total|value|sum|extension/, /rate/);
  if (cQty < 0 && cAmount < 0) throw new Error('The heading row needs a Quantity or an Amount column');

  const items: ImportedItem[] = [];
  const skipped: string[] = [];
  let section: string | null = null;
  rows.slice(headIdx + 1).forEach((r, i) => {
    const rowNo = headIdx + i + 2;
    const description = (r[cDesc] ?? '').replace(/\s+/g, ' ').trim();
    const quantity = cQty >= 0 ? toNumber(r[cQty]) : null;
    const rate = cRate >= 0 ? toNumber(r[cRate]) : null;
    const amountCell = cAmount >= 0 ? toNumber(r[cAmount]) : null;
    if (!description) {
      if (quantity != null || amountCell != null) skipped.push(`row ${rowNo}: figures with no description`);
      return;
    }
    if (SKIP.test(description)) return;
    if (quantity == null && rate == null && amountCell == null) {
      // A heading: a new bill or element.
      section = description.slice(0, 200);
      return;
    }
    const amount = amountCell ?? (quantity != null && rate != null ? quantity * rate : null);
    if (amount == null) {
      // Measured but not priced yet (a tender bill): it carries no value.
      items.push({ section, ref: cRef >= 0 ? r[cRef] || null : null, description: description.slice(0, 2000), unit: cUnit >= 0 ? r[cUnit] || null : null, quantity, rate: null, amount: 0, type: typeOf(description) });
      return;
    }
    items.push({
      section,
      ref: cRef >= 0 ? (r[cRef] || null)?.slice(0, 40) ?? null : null,
      description: description.slice(0, 2000),
      unit: cUnit >= 0 ? (r[cUnit] || null)?.slice(0, 20) ?? null : null,
      quantity,
      rate,
      amount: round(amount),
      type: typeOf(description),
    });
  });
  if (!items.length) throw new Error('No priced or measured items were found under the heading row');
  return { items, skipped };
}

/** The bill back out as a workbook, for the QS's own system. */
export async function writeBoq(plan: { number: string; title: string; currency: string; items: ImportedItem[] }, totals: { label: string; value: number }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Setjeka';
  const ws = wb.addWorksheet(plan.number);
  ws.columns = [
    { header: 'Item', key: 'ref', width: 10 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: `Rate (${plan.currency})`, key: 'rate', width: 14 },
    { header: `Amount (${plan.currency})`, key: 'amount', width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  let section: string | null = null;
  for (const i of plan.items) {
    if (i.section !== section) {
      section = i.section;
      if (section) ws.addRow({ description: section }).font = { bold: true };
    }
    ws.addRow({ ref: i.ref, description: i.description, unit: i.unit, quantity: i.quantity, rate: i.rate, amount: i.amount });
  }
  ws.addRow({});
  for (const t of totals) ws.addRow({ description: t.label, amount: t.value }).font = { bold: true };
  for (const k of ['quantity', 'rate', 'amount']) ws.getColumn(k).numFmt = '#,##0.00';
  return Buffer.from(await wb.xlsx.writeBuffer());
}
