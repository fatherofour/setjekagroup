import * as libredwgPkg from '@mlightcad/libredwg-web';
import dxfParserPkg from 'dxf-parser';

// libredwg-web's type files import their own files without extensions,
// which this project's module resolution can't follow, and dxf-parser is
// CommonJS: both are taken through narrow typed shims.
interface LibreDwgApi {
  dwg_read_data(data: ArrayBuffer, type: number): number | undefined;
  convert(ptr: number): any;
  dwg_free(ptr: number): void;
}
const { LibreDwg, Dwg_File_Type } = libredwgPkg as unknown as { LibreDwg: { create(): Promise<LibreDwgApi> }; Dwg_File_Type: { DWG: number; DXF: number } };
const DxfParser = ((dxfParserPkg as unknown as { default?: unknown }).default ?? dxfParserPkg) as new () => { parseSync(text: string): unknown };

/** DWG and DXF drawings drawn as SVG on the server (donor "DWG viewer"), so
 * the browser shows them like any other sheet and the markup tools work on
 * them. Every entity is drawn on its own, so one the reader doesn't know
 * can't stop the rest of the drawing. Entities are grouped by layer for the
 * viewer's layer switches. */

type P = { x: number; y: number };
type M = [number, number, number, number, number, number]; // a b c d e f

const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: M, p: P): P => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

// AutoCAD Colour Index: 1-9 are named, 10-249 run round the hue wheel in
// five shades each, 250-255 are greys.
function aci(i: number): string {
  // CAD colours assume a black screen; on the white sheet the pale ones are
  // darkened so they stay readable.
  const base: Record<number, string> = { 1: '#e00000', 2: '#b89a00', 3: '#00a000', 4: '#0097a7', 5: '#0000ff', 6: '#c000c0', 7: '#000000', 8: '#808080', 9: '#a0a0a0' };
  if (base[i]) return base[i];
  if (i >= 250 && i <= 255) {
    const v = Math.round(51 + (i - 250) * 40.8);
    return `rgb(${v},${v},${v})`;
  }
  if (i >= 10 && i <= 249) {
    const hue = Math.floor((i - 10) / 10) * 15;
    const shade = (i - 10) % 10;
    const light = [50, 75, 35, 60, 25, 50, 18, 40, 12, 30][shade];
    const sat = shade % 2 ? 60 : 100;
    return `hsl(${hue},${sat}%,${Math.min(light, 42)}%)`;
  }
  return '#000000';
}

// White and near-white draw black on the white sheet.
function trueColor(rgbInt: number) {
  let r = (rgbInt >> 16) & 255;
  let g = (rgbInt >> 8) & 255;
  let b = rgbInt & 255;
  if (r > 235 && g > 235 && b > 235) return '#000000';
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.7) [r, g, b] = [r, g, b].map((v) => Math.round(v * 0.6));
  return `rgb(${r},${g},${b})`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** MTEXT formatting codes stripped to plain lines. */
function mtextLines(raw: unknown): string[] {
  return String(raw ?? '')
    .replace(/\\P/g, '\n')
    .replace(/\\[ACcFfHhLlOoQqTtWwKk][^;\\]*;?/g, '')
    .replace(/\\S([^;]*)[#^/]([^;]*);/g, '$1/$2')
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .split('\n');
}

const textOf = (s: unknown) => String(s ?? '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '');

/** A neutral entity both readers are mapped onto. */
interface Ent {
  type: string;
  layer: string;
  color?: string;
  weight?: number;
  [k: string]: unknown;
}
interface Drawing {
  entities: Ent[];
  blocks: Map<string, Ent[]>;
  layers: Map<string, { color: string; off: boolean }>;
}

class Svg {
  parts = new Map<string, string[]>();
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  count = 0;
  skipped = 0;
  boxes: [number, number, number, number][] = [];
  cur: [number, number, number, number] | null = null;

  grow(p: P) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    this.minX = Math.min(this.minX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxX = Math.max(this.maxX, p.x);
    this.maxY = Math.max(this.maxY, p.y);
    const c = (this.cur ??= [p.x, p.y, p.x, p.y]);
    c[0] = Math.min(c[0], p.x);
    c[1] = Math.min(c[1], p.y);
    c[2] = Math.max(c[2], p.x);
    c[3] = Math.max(c[3], p.y);
  }

  /** The drawing's extents from the bulk of its entities: with enough of
   * them, the outer 2% each side are left out, so a stray line far away
   * (common in real DWGs) doesn't shrink the drawing to a dot. */
  extents() {
    if (this.boxes.length < 30) return [this.minX, this.minY, this.maxX, this.maxY];
    const q = (arr: number[], t: number) => arr.sort((a, b) => a - b)[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * t)))];
    const x0 = q(this.boxes.map((b) => b[0]), 0.02);
    const y0 = q(this.boxes.map((b) => b[1]), 0.02);
    const x1 = q(this.boxes.map((b) => b[2]), 0.98);
    const y1 = q(this.boxes.map((b) => b[3]), 0.98);
    // Keep whatever sits wholly inside a margin round that core.
    const mx = (x1 - x0) * 0.15;
    const my = (y1 - y0) * 0.15;
    const inside = this.boxes.filter((b) => b[0] >= x0 - mx && b[2] <= x1 + mx && b[1] >= y0 - my && b[3] <= y1 + my);
    if (!inside.length) return [x0, y0, x1, y1];
    return [Math.min(...inside.map((b) => b[0])), Math.min(...inside.map((b) => b[1])), Math.max(...inside.map((b) => b[2])), Math.max(...inside.map((b) => b[3]))];
  }
  add(layer: string, el: string) {
    const list = this.parts.get(layer) ?? [];
    list.push(el);
    this.parts.set(layer, list);
    this.count++;
  }
}

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

function polyline(svg: Svg, layer: string, pts: P[], style: string, closed = false, fill = 'none') {
  if (pts.length < 2) return;
  pts.forEach((p) => svg.grow(p));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(-p.y)}`).join('') + (closed ? 'Z' : '');
  svg.add(layer, `<path d="${d}" fill="${fill}" ${style}/>`);
}

function arcPoints(c: P, rx: number, ry: number, rot: number, a0: number, a1: number): P[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(8, Math.min(180, Math.ceil(sweep / (Math.PI / 36))));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    out.push({ x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return out;
}

/** Bulged polyline vertices to points (a bulge is tan(angle/4) of an arc). */
function bulgePoints(vs: { x: number; y: number; bulge?: number }[], closed: boolean): P[] {
  const out: P[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const a = vs[i];
    out.push({ x: a.x, y: a.y });
    const b = vs[(i + 1) % n];
    if ((i === n - 1 && !closed) || !a.bulge) continue;
    const theta = 4 * Math.atan(a.bulge);
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (!chord) continue;
    const r = chord / (2 * Math.sin(theta / 2));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const h = r * Math.cos(theta / 2);
    const nx = -(b.y - a.y) / chord;
    const ny = (b.x - a.x) / chord;
    const c = { x: mid.x + nx * h, y: mid.y + ny * h };
    const a0 = Math.atan2(a.y - c.y, a.x - c.x);
    const steps = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 24)));
    for (let k = 1; k < steps; k++) {
      const t = a0 + (theta * k) / steps;
      out.push({ x: c.x + Math.abs(r) * Math.cos(t), y: c.y + Math.abs(r) * Math.sin(t) });
    }
  }
  return out;
}

function render(d: Drawing): { svg: string; layers: string[]; entities: number; skipped: number } {
  const svg = new Svg();
  const draw = (ents: Ent[], m: M, depth: number, inherited: { layer?: string; color?: string }) => {
    if (depth > 10) return;
    for (const e of ents) {
      try {
        const layer = e.layer === '0' && inherited.layer ? inherited.layer : e.layer || '0';
        const ly = d.layers.get(layer);
        if (ly?.off) continue;
        const color = e.color === 'BYBLOCK' ? (inherited.color ?? '#000000') : (e.color ?? ly?.color ?? '#000000');
        const w = Math.max(0.6, Math.min(4, ((e.weight as number) > 0 ? (e.weight as number) : 25) / 25));
        const style = `stroke="${color}" stroke-width="${f(w)}" vector-effect="non-scaling-stroke"`;
        const T = (p: P) => apply(m, p);
        switch (e.type) {
          case 'LINE':
            polyline(svg, layer, [T(e.start as P), T(e.end as P)], style);
            break;
          case 'POLYLINE':
            polyline(svg, layer, bulgePoints(e.vertices as { x: number; y: number; bulge?: number }[], Boolean(e.closed)).map(T), style, Boolean(e.closed));
            break;
          case 'CIRCLE':
            polyline(svg, layer, arcPoints(e.center as P, e.radius as number, e.radius as number, 0, 0, Math.PI * 2).map(T), style, true);
            break;
          case 'ARC':
            polyline(svg, layer, arcPoints(e.center as P, e.radius as number, e.radius as number, 0, e.start as number, e.end as number).map(T), style);
            break;
          case 'ELLIPSE': {
            const major = e.major as P;
            const rx = Math.hypot(major.x, major.y);
            const full = Math.abs((e.end as number) - (e.start as number)) >= Math.PI * 2 - 1e-6;
            polyline(svg, layer, arcPoints(e.center as P, rx, rx * (e.ratio as number), Math.atan2(major.y, major.x), e.start as number, full ? (e.start as number) + Math.PI * 2 : (e.end as number)).map(T), style, full);
            break;
          }
          case 'SOLID': {
            const pts = (e.points as P[]).map(T);
            // A SOLID's corners run 1-2-4-3.
            const ordered = pts.length === 4 ? [pts[0], pts[1], pts[3], pts[2]] : pts;
            polyline(svg, layer, ordered, style, true, color);
            break;
          }
          case 'HATCH':
            for (const loop of e.loops as P[][]) polyline(svg, layer, loop.map(T), `${style} fill-opacity="${e.solid ? 0.85 : 0.12}"`, true, color);
            break;
          case 'TEXT': {
            const p = T(e.at as P);
            svg.grow(p);
            const size = (e.height as number) * scaleOf(m);
            const rot = ((e.rotation as number) + Math.atan2(m[1], m[0])) * (180 / Math.PI);
            const anchor = e.anchor as string;
            for (const [i, line] of (e.lines as string[]).entries()) {
              if (!line.trim()) continue;
              svg.add(layer, `<text x="${f(p.x)}" y="${f(-p.y + i * size * 1.25)}" font-size="${f(size)}" fill="${color}" text-anchor="${anchor}" transform="rotate(${f(-rot)} ${f(p.x)} ${f(-p.y)})" font-family="Arial, Helvetica, sans-serif">${esc(line)}</text>`);
              svg.grow({ x: p.x + size * line.length * 0.6, y: p.y - i * size * 1.25 });
            }
            break;
          }
          case 'INSERT': {
            const block = d.blocks.get(e.name as string);
            if (!block) break;
            const at = e.at as P;
            const base = (e.base as P | undefined) ?? { x: 0, y: 0 };
            const r = (e.rotation as number) ?? 0;
            const sx = (e.sx as number) || 1;
            const sy = (e.sy as number) || 1;
            const local: M = mul(mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), at.x, at.y], [sx, 0, 0, sy, 0, 0]), [1, 0, 0, 1, -base.x, -base.y]);
            draw(block, mul(m, local), depth + 1, { layer, color });
            for (const a of (e.attribs as Ent[]) ?? []) draw([a], m, depth + 1, { layer, color });
            break;
          }
          case 'DIMENSION': {
            const block = d.blocks.get(e.name as string);
            if (block) draw(block, m, depth + 1, { layer, color });
            break;
          }
          case 'POINT': {
            const p = T(e.at as P);
            svg.grow(p);
            svg.add(layer, `<circle cx="${f(p.x)}" cy="${f(-p.y)}" r="0.5" fill="${color}"/>`);
            break;
          }
          default:
            svg.skipped++;
        }
      } catch {
        svg.skipped++;
      }
    }
  };
  for (const e of d.entities) {
    svg.cur = null;
    draw([e], ID, 0, {});
    if (svg.cur) svg.boxes.push(svg.cur);
  }
  if (!Number.isFinite(svg.minX)) throw new Error('Nothing in this drawing could be drawn');
  const [ex0, ey0, ex1, ey1] = svg.extents();
  const w = Math.max(ex1 - ex0, 1e-6);
  const h = Math.max(ey1 - ey0, 1e-6);
  const pad = Math.max(w, h) * 0.02;
  const vb = [ex0 - pad, -ey1 - pad, w + 2 * pad, h + 2 * pad];
  // A fixed pixel size for the longer side, so markups (page fractions) and
  // the scale line work as on any image.
  const long = 4000;
  const pxW = vb[2] >= vb[3] ? long : Math.round((long * vb[2]) / vb[3]);
  const pxH = vb[2] >= vb[3] ? Math.round((long * vb[3]) / vb[2]) : long;
  const layers = [...svg.parts.keys()].sort((a, b) => a.localeCompare(b));
  const body = layers.map((l) => `<g data-layer="${esc(l)}">${svg.parts.get(l)!.join('')}</g>`).join('');
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="${vb.map(f).join(' ')}" preserveAspectRatio="xMidYMid meet" stroke-linecap="round" stroke-linejoin="round"><rect x="${f(vb[0])}" y="${f(vb[1])}" width="${f(vb[2])}" height="${f(vb[3])}" fill="#ffffff"/>${body}</svg>`;
  return { svg: out, layers, entities: svg.count, skipped: svg.skipped };
}

/** Convert each entity on its own: one the reader can't map is left out. */
function mapAll(list: unknown, fn: (e: Record<string, any>) => Ent | null): Ent[] {
  const out: Ent[] = [];
  for (const e of (Array.isArray(list) ? list : []) as Record<string, any>[]) {
    try {
      const m = fn(e);
      if (m) out.push(m);
    } catch {
      // left out
    }
  }
  return out;
}

// ---- DWG via libredwg ----------------------------------------------------------

let lib: LibreDwgApi | null = null;

/** An entity's own colour; undefined means by layer. */
function colorOf(e: { colorIndex?: number; color?: number }): string | undefined {
  if (e.colorIndex === 0) return 'BYBLOCK';
  if (e.colorIndex && e.colorIndex > 0 && e.colorIndex < 256) return aci(e.colorIndex);
  if (e.colorIndex === 256 || e.colorIndex === undefined) return undefined;
  return e.color !== undefined && e.color >= 0 ? trueColor(e.color) : undefined;
}

function fromDwgEntity(e: Record<string, any>): Ent | null {
  const base = { layer: e.layer ?? '0', color: colorOf(e), weight: e.lineweight };
  switch (e.type) {
    case 'LINE':
      return { type: 'LINE', ...base, start: e.startPoint, end: e.endPoint };
    case 'LWPOLYLINE':
      return { type: 'POLYLINE', ...base, vertices: e.vertices, closed: (e.flag & 1) === 1 };
    case 'POLYLINE2D':
    case 'POLYLINE3D':
      return { type: 'POLYLINE', ...base, vertices: (e.vertices ?? []).map((v: any) => ({ x: v.point?.x ?? v.x, y: v.point?.y ?? v.y, bulge: v.bulge })), closed: (e.flag & 1) === 1 };
    case 'CIRCLE':
      return { type: 'CIRCLE', ...base, center: e.center, radius: e.radius };
    case 'ARC':
      return { type: 'ARC', ...base, center: e.center, radius: e.radius, start: e.startAngle, end: e.endAngle };
    case 'ELLIPSE':
      return { type: 'ELLIPSE', ...base, center: e.center, major: e.majorAxisEndPoint, ratio: e.axisRatio, start: e.startAngle, end: e.endAngle };
    case 'SPLINE': {
      const pts = (e.fitPoints?.length ? e.fitPoints : e.controlPoints) ?? [];
      return pts.length > 1 ? { type: 'POLYLINE', ...base, vertices: pts, closed: (e.flag & 1) === 1 } : null;
    }
    case 'SOLID':
    case 'TRACE':
      return { type: 'SOLID', ...base, points: [e.corner1, e.corner2, e.corner3, e.corner4 ?? e.corner3].filter(Boolean) };
    case '3DFACE':
      return { type: 'POLYLINE', ...base, vertices: [e.firstCorner, e.secondCorner, e.thirdCorner, e.fourthCorner].filter(Boolean), closed: true };
    case 'TEXT':
    case 'ATTRIB':
    case 'ATTDEF': {
      if (e.type === 'ATTDEF') return null;
      const aligned = e.halign && e.halign !== 0 && e.endPoint && (e.endPoint.x || e.endPoint.y);
      return { type: 'TEXT', ...base, at: aligned ? e.endPoint : e.startPoint, height: e.textHeight || 1, rotation: e.rotation ?? 0, lines: [textOf(e.text ?? '')], anchor: ['start', 'middle', 'end', 'start', 'middle', 'start'][e.halign ?? 0] ?? 'start' };
    }
    case 'MTEXT': {
      const rot = e.rotation ?? (e.direction ? Math.atan2(e.direction.y, e.direction.x) : 0);
      const col = ((e.attachmentPoint ?? 1) - 1) % 3;
      return { type: 'TEXT', ...base, at: e.insertionPoint, height: e.textHeight || 1, rotation: rot, lines: mtextLines(e.text ?? ''), anchor: ['start', 'middle', 'end'][col] };
    }
    case 'INSERT':
      return { type: 'INSERT', ...base, name: e.name, at: e.insertionPoint, rotation: e.rotation ?? 0, sx: e.xScale, sy: e.yScale, attribs: mapAll(e.attribs, fromDwgEntity) };
    case 'DIMENSION':
      return { type: 'DIMENSION', ...base, name: e.name };
    case 'POINT':
      return { type: 'POINT', ...base, at: e.position ?? e.point ?? e };
    case 'HATCH': {
      const loops: P[][] = [];
      for (const path of e.boundaryPaths ?? []) {
        if (path.vertices?.length) loops.push(bulgePoints(path.vertices, true));
        else if (path.edges?.length) {
          const pts: P[] = [];
          for (const ed of path.edges) {
            if (ed.type === 1) pts.push(ed.start, ed.end);
            else if (ed.type === 2 && ed.center) pts.push(...arcPoints(ed.center, ed.radius, ed.radius, 0, ed.startAngle ?? 0, ed.endAngle ?? Math.PI * 2));
          }
          if (pts.length > 2) loops.push(pts);
        }
      }
      return loops.length ? { type: 'HATCH', ...base, loops, solid: e.solidFill === 1 } : null;
    }
    default:
      return null;
  }
}

async function readDwg(bytes: Uint8Array): Promise<Drawing> {
  lib ??= await LibreDwg.create();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const ptr = lib.dwg_read_data(ab, Dwg_File_Type.DWG);
  if (ptr === undefined) throw new Error('This DWG could not be read');
  try {
    const db = lib.convert(ptr);
    const layers = new Map<string, { color: string; off: boolean }>();
    for (const l of db.tables.LAYER.entries as any[]) layers.set(l.name, { color: l.colorIndex > 0 && l.colorIndex < 256 ? aci(l.colorIndex) : trueColor(l.color ?? 0), off: Boolean(l.off || l.frozen || l.colorIndex < 0) });
    const records = db.tables.BLOCK_RECORD.entries as any[];
    const basePoint = new Map<string, P>(records.map((b) => [b.name, b.basePoint ?? { x: 0, y: 0 }]));
    // A block's base point is applied by the INSERT that places it.
    const withBase = (ents: Ent[]) => ents.map((e) => (e.type === 'INSERT' ? { ...e, base: basePoint.get(e.name as string) } : e));
    const blocks = new Map<string, Ent[]>();
    for (const b of records) blocks.set(b.name, withBase(mapAll(b.entities, fromDwgEntity)));
    // Paper space sheets carry viewports, not drawing; model space is drawn.
    const entities = withBase(mapAll((db.entities as any[]).filter((e) => !e.isInPaperSpace), fromDwgEntity));
    return { entities, blocks, layers };
  } finally {
    lib.dwg_free(ptr);
  }
}

// ---- DXF via dxf-parser --------------------------------------------------------

function fromDxfEntity(e: Record<string, any>): Ent | null {
  const base = { layer: e.layer ?? '0', color: e.colorIndex === 0 ? 'BYBLOCK' : e.colorIndex > 0 && e.colorIndex < 256 ? aci(e.colorIndex) : undefined, weight: e.lineweight };
  const deg = (a?: number) => ((a ?? 0) * Math.PI) / 180;
  switch (e.type) {
    case 'LINE':
      return { type: 'LINE', ...base, start: e.vertices[0], end: e.vertices[1] };
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return { type: 'POLYLINE', ...base, vertices: e.vertices ?? [], closed: Boolean(e.shape) };
    case 'CIRCLE':
      return { type: 'CIRCLE', ...base, center: e.center, radius: e.radius };
    case 'ARC':
      return { type: 'ARC', ...base, center: e.center, radius: e.radius, start: e.startAngle, end: e.endAngle };
    case 'ELLIPSE':
      return { type: 'ELLIPSE', ...base, center: e.center, major: e.majorAxisEndPoint, ratio: e.axisRatio, start: e.startAngle, end: e.endAngle };
    case 'SPLINE': {
      const pts = (e.fitPoints?.length ? e.fitPoints : e.controlPoints) ?? [];
      return pts.length > 1 ? { type: 'POLYLINE', ...base, vertices: pts, closed: Boolean(e.closed) } : null;
    }
    case 'SOLID':
    case '3DFACE':
      return { type: 'SOLID', ...base, points: e.points ?? e.vertices ?? [] };
    case 'TEXT':
    case 'ATTRIB':
      return { type: 'TEXT', ...base, at: e.halign && e.endPoint ? e.endPoint : e.startPoint, height: e.textHeight || 1, rotation: deg(e.rotation), lines: [textOf(e.text ?? '')], anchor: ['start', 'middle', 'end', 'start', 'middle', 'start'][e.halign ?? 0] ?? 'start' };
    case 'MTEXT':
      return { type: 'TEXT', ...base, at: e.position, height: e.height || 1, rotation: deg(e.rotation), lines: mtextLines(e.text ?? ''), anchor: ['start', 'middle', 'end'][((e.attachmentPoint ?? 1) - 1) % 3] };
    case 'INSERT':
      return { type: 'INSERT', ...base, name: e.name, at: e.position, rotation: deg(e.rotation), sx: e.xScale ?? 1, sy: e.yScale ?? 1 };
    case 'DIMENSION':
      return { type: 'DIMENSION', ...base, name: e.block };
    case 'POINT':
      return { type: 'POINT', ...base, at: e.position };
    default:
      return null;
  }
}

function readDxf(text: string): Drawing {
  const dxf = new DxfParser().parseSync(text) as any;
  if (!dxf) throw new Error('This DXF could not be read');
  const layers = new Map<string, { color: string; off: boolean }>();
  for (const [name, l] of Object.entries((dxf.tables?.layer?.layers ?? {}) as Record<string, any>)) layers.set(name, { color: l.colorIndex > 0 && l.colorIndex < 256 ? aci(l.colorIndex) : trueColor(l.color ?? 0), off: Boolean(l.frozen || l.visible === false) });
  // A block's base point is applied by the INSERT that places it.
  const withBase = (ents: Ent[]) =>
    ents.map((e) => (e.type === 'INSERT' ? { ...e, base: (dxf.blocks?.[e.name as string]?.position as P | undefined) ?? { x: 0, y: 0 } } : e));
  const blocks = new Map<string, Ent[]>();
  for (const [name, b] of Object.entries((dxf.blocks ?? {}) as Record<string, any>)) blocks.set(name, withBase(mapAll(b.entities, fromDxfEntity)));
  return { entities: withBase(mapAll(dxf.entities, fromDxfEntity)), blocks, layers };
}

export async function cadToSvg(bytes: Uint8Array, fileName: string) {
  const isDxf = /\.dxf$/i.test(fileName);
  const drawing = isDxf ? readDxf(Buffer.from(bytes).toString('utf-8')) : await readDwg(bytes);
  return render(drawing);
}
