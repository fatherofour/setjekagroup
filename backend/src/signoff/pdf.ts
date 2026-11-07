import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

// Setjeka green, and red for rejections.
const GREEN = rgb(0.055, 0.239, 0.173);
const RED = rgb(0.72, 0.11, 0.11);
const INK = rgb(0.08, 0.12, 0.1);
const MUTED = rgb(0.38, 0.43, 0.4);
const LINE = rgb(0.8, 0.84, 0.81);

export interface SignOffDetails {
  projectName: string;
  title: string;
  /** e.g. "Stage 1 document", "Variation", "Drawing". */
  kind: string;
  outcomeLabel: string;
  approved: boolean;
  comment?: string;
  signerName: string;
  signerRole?: string;
  /** The name the signer typed when signing. */
  signedName?: string;
  signedAt: Date;
  /** The public page that confirms this sign-off; encoded in the QR code. */
  verifyUrl?: string;
  methodLabel: string;
  signature?: Uint8Array;
  recordId: string;
  ipAddress?: string;
  /** What was decided, line by line, for the certificate. */
  facts: [string, string][];
}

const when = (d: Date) =>
  d.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (SAST)';

/** Standard PDF fonts only cover Latin-1; anything else becomes "?" rather
 * than failing the whole document. */
function safe(font: PDFFont, text: string) {
  let out = '';
  for (const ch of text.replace(/\r/g, '')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += ch === '—' || ch === '–' ? '-' : '?';
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of safe(font, text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

async function embedSignature(doc: PDFDocument, bytes?: Uint8Array): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

function fit(img: PDFImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { width: img.width * scale, height: img.height * scale };
}

/** The sign-off page: what was decided, by whom, how and when. Used on its
 * own for records that aren't files, and appended to a stamped drawing. */
async function addCertificatePage(doc: PDFDocument, d: SignOffDetails) {
  const page = doc.addPage([595.28, 841.89]);
  const [regular, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  const { width, height } = page.getSize();
  const left = 50;
  const right = width - 50;
  const tone = d.approved ? GREEN : RED;

  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: GREEN });
  page.drawText('SETJEKA GROUP', { x: left, y: height - 45, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(d.kind === 'Certificate of completion' ? d.kind : 'Sign-off certificate', { x: left, y: height - 68, size: 12, font: regular, color: rgb(0.86, 0.93, 0.89) });

  let y = height - 130;
  page.drawText(safe(bold, d.projectName), { x: left, y, size: 11, font: bold, color: MUTED });
  y -= 24;
  for (const line of wrap(bold, d.title, 18, right - left)) {
    page.drawText(line, { x: left, y, size: 18, font: bold, color: INK });
    y -= 22;
  }
  page.drawText(safe(regular, d.kind), { x: left, y, size: 10, font: regular, color: MUTED });
  y -= 30;

  page.drawRectangle({ x: left, y: y - 34, width: right - left, height: 40, borderColor: tone, borderWidth: 1.5, color: rgb(1, 1, 1) });
  page.drawText(safe(bold, d.outcomeLabel.toUpperCase()), { x: left + 14, y: y - 20, size: 16, font: bold, color: tone });
  y -= 60;

  const row = (label: string, value: string) => {
    page.drawText(safe(regular, label), { x: left, y, size: 9.5, font: regular, color: MUTED });
    const lines = wrap(regular, value || '-', 10.5, right - left - 150);
    for (const line of lines) {
      page.drawText(line, { x: left + 150, y, size: 10.5, font: regular, color: INK });
      y -= 14;
    }
    y -= 6;
  };
  for (const [label, value] of d.facts) row(label, value);
  if (d.comment) row('Comments', d.comment);

  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: LINE });
  y -= 22;
  page.drawText('Signed by', { x: left, y, size: 9.5, font: regular, color: MUTED });
  page.drawText(safe(bold, d.signerName + (d.signerRole ? `, ${d.signerRole}` : '')), { x: left + 150, y, size: 11, font: bold, color: INK });
  y -= 18;
  if (d.signedName) row('Name entered', d.signedName);
  row('Date and time', when(d.signedAt));
  row('Signed by way of', d.methodLabel);

  const sig = await embedSignature(doc, d.signature);
  if (sig) {
    const size = fit(sig, 220, 80);
    page.drawRectangle({ x: left + 150, y: y - size.height - 10, width: 240, height: size.height + 16, borderColor: LINE, borderWidth: 0.7 });
    page.drawImage(sig, { x: left + 160, y: y - size.height - 2, ...size });
    y -= size.height + 30;
  }

  // The QR code: scanning it opens the platform's record of this sign-off,
  // so anyone holding the paper can check it is genuine and when it was agreed.
  if (d.verifyUrl) {
    const png = await QRCode.toBuffer(d.verifyUrl, { type: 'png', margin: 1, width: 240, errorCorrectionLevel: 'M' });
    const qr = await doc.embedPng(new Uint8Array(png));
    const size = 92;
    const qx = right - size;
    const qy = 160;
    page.drawImage(qr, { x: qx, y: qy, width: size, height: size });
    const caption = ['Scan to verify this sign-off', `Agreed ${d.signedAt.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric' })}`];
    caption.forEach((c, i) => {
      const w = regular.widthOfTextAtSize(c, 7.5);
      page.drawText(c, { x: qx + size - w, y: qy - 10 - i * 10, size: 7.5, font: regular, color: MUTED });
    });
  }

  const foot = [
    `Record ${d.recordId}${d.ipAddress ? ` · from ${d.ipAddress}` : ''}`,
    'This electronic signature was applied in the Setjeka platform by the signer named above, after signing in to their own account.',
    'The platform keeps a fingerprint (SHA-256) of this file against the record, so any later change to it can be detected.',
    ...(d.verifyUrl ? [`Check it at ${d.verifyUrl}`] : []),
  ];
  let fy = 70;
  for (const line of foot.reverse()) {
    for (const l of wrap(regular, line, 8, right - left).reverse()) {
      page.drawText(l, { x: left, y: fy, size: 8, font: regular, color: MUTED });
      fy += 11;
    }
  }
}

/** The approval stamp on the first page of the signed file itself. Placed
 * top right, away from the usual title block at the bottom right. */
async function stampPage(doc: PDFDocument, page: PDFPage, d: SignOffDetails) {
  const [regular, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  const { width, height } = page.getSize();
  const scale = Math.max(0.6, Math.min(1.6, Math.min(width, height) / 595));
  const w = 200 * scale;
  const h = 104 * scale;
  const x = width - w - 18 * scale;
  const top = height - 18 * scale;
  const tone = d.approved ? GREEN : RED;
  page.drawRectangle({ x, y: top - h, width: w, height: h, color: rgb(1, 1, 1), opacity: 0.92, borderColor: tone, borderWidth: 1.5 * scale });
  const pad = 8 * scale;
  let y = top - pad - 11 * scale;
  page.drawText(safe(bold, d.outcomeLabel.toUpperCase()), { x: x + pad, y, size: 11 * scale, font: bold, color: tone });
  y -= 12 * scale;
  page.drawText(safe(regular, `${d.signerName}${d.signerRole ? `, ${d.signerRole}` : ''}`).slice(0, 48), { x: x + pad, y, size: 7.5 * scale, font: regular, color: INK });
  y -= 10 * scale;
  page.drawText(safe(regular, when(d.signedAt)), { x: x + pad, y, size: 7 * scale, font: regular, color: MUTED });
  const sig = await embedSignature(doc, d.signature);
  if (sig) {
    const size = fit(sig, w - 2 * pad, 38 * scale);
    page.drawImage(sig, { x: x + pad, y: top - h + 16 * scale, ...size });
  } else {
    page.drawText('Accepted electronically', { x: x + pad, y: top - h + 26 * scale, size: 8 * scale, font: bold, color: INK });
  }
  page.drawText(safe(regular, `Setjeka sign-off · ${d.recordId.slice(0, 8)}`), { x: x + pad, y: top - h + 6 * scale, size: 6 * scale, font: regular, color: MUTED });
}

/** A signed copy of a file: a PDF stamped on its first page, or an image
 * placed on a page and stamped, each followed by the sign-off page. Returns
 * null for files that can't be stamped (CAD, Office files). */
export async function stampedCopy(source: Uint8Array, mimeType: string, d: SignOffDetails): Promise<Uint8Array | null> {
  let doc: PDFDocument;
  if (mimeType === 'application/pdf') {
    try {
      doc = await PDFDocument.load(source, { ignoreEncryption: true });
    } catch {
      return null;
    }
  } else if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
    doc = await PDFDocument.create();
    const img = mimeType === 'image/png' ? await doc.embedPng(source) : await doc.embedJpg(source);
    const landscape = img.width >= img.height;
    const pageSize: [number, number] = landscape ? [841.89, 595.28] : [595.28, 841.89];
    const page = doc.addPage(pageSize);
    const size = fit(img, pageSize[0] - 40, pageSize[1] - 40);
    page.drawImage(img, { x: (pageSize[0] - size.width) / 2, y: (pageSize[1] - size.height) / 2, ...size });
  } else return null;
  if (doc.getPageCount() === 0) return null;
  await stampPage(doc, doc.getPage(0), d);
  await addCertificatePage(doc, d);
  doc.setTitle(`${d.title} - ${d.outcomeLabel}`);
  doc.setProducer('Setjeka platform');
  return doc.save();
}

/** A sign-off certificate on its own, for records that aren't files (Stage
 * 1 documents, variations, stage moves) and files that can't be stamped. */
export async function certificate(d: SignOffDetails): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  await addCertificatePage(doc, d);
  doc.setTitle(`${d.title} - ${d.outcomeLabel}`);
  doc.setProducer('Setjeka platform');
  return doc.save();
}
