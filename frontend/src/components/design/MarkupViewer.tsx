'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  Hand,
  Layers,
  Ruler,
  Spline,
  Stamp,
  Scaling,
  Loader2,
  MapPin,
  Minus,
  PenLine,
  Plus,
  RectangleHorizontal,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { fmtDay, inputCls, memberName, primaryBtn, secondaryBtn, selectCls, type Member } from '@/lib/architect';

type Kind = 'PEN' | 'RECTANGLE' | 'CLOUD' | 'ARROW' | 'TEXT' | 'PIN' | 'STAMP' | 'MEASURE' | 'AREA';
type Tool = Kind | 'PAN' | 'CALIBRATE';
interface Calibration {
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  realLength: number;
}
type Pt = [number, number];
type Geometry = { points?: Pt[]; x?: number; y?: number; w?: number; h?: number; from?: Pt; to?: Pt };
interface Markup {
  id: string;
  page: number;
  kind: Kind;
  geometry: Geometry;
  color: string;
  text: string | null;
  author: { id: string; fullName: string };
  resolvedAt: string | null;
  resolvedBy: { fullName: string } | null;
  issue: { id: string; title: string; status: string } | null;
  createdAt: string;
}

const TOOLS: { kind: Tool; label: string; icon: LucideIcon }[] = [
  { kind: 'PAN', label: 'Move around', icon: Hand },
  { kind: 'PEN', label: 'Redline', icon: PenLine },
  { kind: 'CLOUD', label: 'Revision cloud', icon: Cloud },
  { kind: 'RECTANGLE', label: 'Box', icon: RectangleHorizontal },
  { kind: 'ARROW', label: 'Arrow', icon: ArrowUpRight },
  { kind: 'TEXT', label: 'Note', icon: Type },
  { kind: 'PIN', label: 'Pin a site observation', icon: MapPin },
  { kind: 'STAMP', label: 'Stamp', icon: Stamp },
  { kind: 'CALIBRATE', label: 'Set the scale', icon: Scaling },
  { kind: 'MEASURE', label: 'Measure a length', icon: Ruler },
  { kind: 'AREA', label: 'Measure an area', icon: Spline },
];
const STAMPS = ['APPROVED', 'APPROVED AS NOTED', 'REVISE AND RESUBMIT', 'REJECTED', 'FOR CONSTRUCTION', 'FOR INFORMATION ONLY', 'NOT FOR CONSTRUCTION'];
const STAMP_COLOUR: Record<string, string> = {
  APPROVED: '#16a34a',
  'APPROVED AS NOTED': '#16a34a',
  'FOR CONSTRUCTION': '#16a34a',
  'REVISE AND RESUBMIT': '#d97706',
  'FOR INFORMATION ONLY': '#2563eb',
  REJECTED: '#dc2626',
  'NOT FOR CONSTRUCTION': '#dc2626',
};

/** Metres per page unit from a calibration line - the same sum the server
 * uses for the exported drawing. */
function metresPerUnit(c: Calibration | undefined, w: number, h: number) {
  if (!c) return null;
  const len = Math.hypot((c.x2 - c.x1) * w, (c.y2 - c.y1) * h);
  return len > 0 ? c.realLength / len : null;
}
function measureOf(kind: Kind, g: Geometry, w: number, h: number, scale: number | null) {
  if (scale === null) return null;
  if (kind === 'MEASURE' && g.from && g.to) return Math.hypot((g.to[0] - g.from[0]) * w, (g.to[1] - g.from[1]) * h) * scale;
  if (kind === 'AREA' && g.points && g.points.length > 2) {
    let a = 0;
    g.points.forEach(([x1, y1], i) => {
      const [x2, y2] = g.points![(i + 1) % g.points!.length];
      a += x1 * w * y2 * h - x2 * w * y1 * h;
    });
    return (Math.abs(a) / 2) * scale * scale;
  }
  return null;
}
const fmtLen = (m: number) => (m >= 100 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`);
const fmtArea = (m: number) => (m >= 100 ? `${m.toFixed(1)} m²` : `${m.toFixed(2)} m²`);
const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#111827'];
const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Scalloped outline of a box, in screen coordinates. */
function cloudPath(x: number, y: number, w: number, h: number) {
  const r = Math.max(5, Math.min(w, h) / 8);
  const parts = [`M ${x} ${y}`];
  const edge = (len: number, dx: number, dy: number) => {
    const n = Math.max(2, Math.round(len / (r * 2)));
    const step = len / n;
    for (let i = 0; i < n; i++) parts.push(`a ${step / 2} ${step / 2} 0 0 1 ${dx * step} ${dy * step}`);
  };
  edge(w, 1, 0);
  edge(h, 0, 1);
  edge(w, -1, 0);
  edge(h, 0, -1);
  return parts.join(' ');
}

/** Mark up a drawing (register DOC row 51, FIELD row 65): redlines, clouds,
 * boxes, arrows, notes and pins, kept apart from the drawing itself. A pin
 * can become a site issue; the drawing downloads with every markup on it. */
export function MarkupViewer({
  projectId,
  documentId,
  revisionId,
  title,
  filename,
  onClose,
}: {
  projectId: string;
  documentId: string;
  revisionId: string;
  title: string;
  /** The revision's file name: DWG and DXF are drawn from the server's SVG. */
  filename?: string;
  onClose: () => void;
}) {
  const { authedFetch, accessToken, user } = useAuth();
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [image, setImage] = useState<{ url: string; w: number; h: number } | null>(null);
  const [cad, setCad] = useState<{ svg: string; w: number; h: number; layers: string[] } | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [calibrating, setCalibrating] = useState<{ from: Pt; to: Pt; length: string } | null>(null);
  const [poly, setPoly] = useState<Pt[] | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [stamp, setStamp] = useState(STAMPS[0]);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [markups, setMarkups] = useState<Markup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tool, setTool] = useState<Tool>('PAN');
  const [color, setColor] = useState(COLORS[0]);
  const [draft, setDraft] = useState<Geometry | null>(null);
  const [placing, setPlacing] = useState<{ kind: 'TEXT' | 'PIN'; x: number; y: number; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(true);
  const [issueFor, setIssueFor] = useState<{ id: string; title: string; ownerId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  // Escape closes the viewer, unless it's mid-typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.closest('input, textarea, [role="listbox"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load the file: a PDF through pdf.js, an image as it is.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        if (filename && /\.(dwg|dxf)$/i.test(filename)) {
          // CAD: the server draws it as SVG, one group per layer.
          url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/drawing.svg`, accessToken);
          const text = await fetch(url).then((r) => r.text());
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          const root = doc.documentElement;
          const w = Number(root.getAttribute('width')) || 1000;
          const h = Number(root.getAttribute('height')) || 1000;
          root.setAttribute('width', '100%');
          root.setAttribute('height', '100%');
          const layers = [...new Set(Array.from(doc.querySelectorAll('g[data-layer]')).map((g) => g.getAttribute('data-layer') ?? ''))].filter(Boolean).sort();
          if (!cancelled) setCad({ svg: new XMLSerializer().serializeToString(root), w, h, layers });
          return;
        }
        url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/file`, accessToken);
        const head = await fetch(url).then((r) => r.blob());
        if (head.type.startsWith('image/')) {
          const img = new Image();
          img.src = url;
          await img.decode();
          if (!cancelled) setImage({ url, w: img.naturalWidth, h: img.naturalHeight });
        } else {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
          const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
          if (!cancelled) setPdf(doc);
        }
      } catch {
        if (!cancelled) setError('This drawing could not be opened for markup');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 1000);
    };
  }, [projectId, documentId, revisionId, accessToken, filename]);

  const load = useCallback(() => {
    authedFetch<Markup[]>(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/markups`)
      .then(setMarkups)
      .catch((e) => setError(err(e, 'Could not load the markups')));
  }, [authedFetch, projectId, documentId, revisionId]);
  useEffect(() => {
    load();
    authedFetch<Calibration[]>(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/calibrations`)
      .then(setCalibrations)
      .catch(() => setCalibrations([]));
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [authedFetch, projectId, documentId, revisionId, load]);

  // Draw the page at a width that fits the screen, times the zoom.
  useEffect(() => {
    if (!pdf || !canvasRef.current || !scrollRef.current) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const fit = Math.max(0.2, (scrollRef.current!.clientWidth - 32) / base.width);
      const vp = p.getViewport({ scale: fit * zoom });
      const canvas = canvasRef.current!;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(vp.width * ratio);
      canvas.height = Math.floor(vp.height * ratio);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const t = p.render({ canvasContext: ctx, viewport: vp });
      task = t;
      await t.promise.catch(() => undefined);
      if (!cancelled) {
        setViewport(vp);
        setSize({ w: vp.width, h: vp.height });
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);

  useEffect(() => {
    const flat = image ?? cad;
    if (!flat || !scrollRef.current) return;
    const fit = Math.max(0.05, (scrollRef.current.clientWidth - 32) / flat.w);
    setSize({ w: flat.w * fit * zoom, h: flat.h * fit * zoom });
  }, [image, cad, zoom]);

  // The page's own proportions (unrotated), which lengths are measured in.
  const dims = useMemo(() => {
    if (viewport) return { w: viewport.viewBox[2] - viewport.viewBox[0], h: viewport.viewBox[3] - viewport.viewBox[1] };
    const flat = image ?? cad;
    return flat ? { w: flat.w, h: flat.h } : { w: 1, h: 1 };
  }, [viewport, image, cad]);
  const calibration = calibrations.find((c) => c.page === page);
  const scale = metresPerUnit(calibration, dims.w, dims.h);

  // Leaving a tool or a page drops anything half drawn.
  const dropDraft = () => {
    setPoly(null);
    setHover(null);
    setCalibrating(null);
    setPlacing(null);
  };
  const chooseTool = (t: Tool) => {
    dropDraft();
    setTool(t);
  };
  const goPage = (p: number) => {
    dropDraft();
    setPage(p);
  };

  // Page fractions (unrotated, origin top left) <-> screen pixels.
  const toScreen = useCallback(
    (x: number, y: number): Pt => {
      if (viewport) {
        const [x0, , , y1] = viewport.viewBox;
        const w = viewport.viewBox[2] - x0;
        const h = y1 - viewport.viewBox[1];
        const [sx, sy] = viewport.convertToViewportPoint(x0 + x * w, y1 - y * h);
        return [sx, sy];
      }
      return [x * size.w, y * size.h];
    },
    [viewport, size],
  );
  const fromScreen = useCallback(
    (sx: number, sy: number): Pt => {
      if (viewport) {
        const [x0, , , y1] = viewport.viewBox;
        const w = viewport.viewBox[2] - x0;
        const h = y1 - viewport.viewBox[1];
        const [px, py] = viewport.convertToPdfPoint(sx, sy);
        return [Math.min(1, Math.max(0, (px - x0) / w)), Math.min(1, Math.max(0, (y1 - py) / h))];
      }
      return [Math.min(1, Math.max(0, sx / size.w)), Math.min(1, Math.max(0, sy / size.h))];
    },
    [viewport, size],
  );

  const pages = pdf?.numPages ?? 1;
  const onPage = useMemo(() => markups.filter((m) => m.page === page && (showResolved || !m.resolvedAt)), [markups, page, showResolved]);
  // Notes and pins are numbered in the order they were made, as in the export.
  const numbers = useMemo(() => {
    const n = new Map<string, number>();
    markups.filter((m) => m.kind === 'PIN' || m.kind === 'TEXT').forEach((m, i) => n.set(m.id, i + 1));
    return n;
  }, [markups]);

  const point = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return fromScreen(e.clientX - r.left, e.clientY - r.top);
  };

  async function save(kind: Kind, geometry: Geometry, text?: string, colour = color) {
    setBusy(true);
    setError(null);
    try {
      const m = await authedFetch<Markup>(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/markups`, {
        method: 'POST',
        body: { page, kind, geometry, color: colour, text },
      });
      setMarkups((all) => [...all, m]);
      setSelected(m.id);
    } catch (e) {
      setError(err(e, 'Could not save the markup'));
    } finally {
      setBusy(false);
    }
  }

  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (tool === 'PAN') {
      const el = scrollRef.current!;
      panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const p = point(e);
    if (tool === 'TEXT' || tool === 'PIN') {
      setPlacing({ kind: tool, x: p[0], y: p[1], text: '' });
      return;
    }
    if (tool === 'STAMP') {
      void save('STAMP', { x: p[0], y: p[1] }, stamp, STAMP_COLOUR[stamp]);
      return;
    }
    if (tool === 'AREA') {
      if (poly && poly.length >= 3) {
        const [fx, fy] = toScreen(...poly[0]);
        const [cx, cy] = toScreen(...p);
        if (Math.hypot(fx - cx, fy - cy) < 12) {
          finishArea();
          return;
        }
      }
      setPoly([...(poly ?? []), p]);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'PEN') setDraft({ points: [p] });
    else if (tool === 'ARROW' || tool === 'MEASURE' || tool === 'CALIBRATE') setDraft({ from: p, to: p });
    else setDraft({ x: p[0], y: p[1], w: 0, h: 0, points: [p] });
  }

  function move(e: ReactPointerEvent<SVGSVGElement>) {
    if (panRef.current) {
      const el = scrollRef.current!;
      el.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x);
      el.scrollTop = panRef.current.st - (e.clientY - panRef.current.y);
      return;
    }
    if (tool === 'AREA' && poly) setHover(point(e));
    if (!draft) return;
    const p = point(e);
    if (tool === 'PEN') setDraft({ points: [...(draft.points ?? []), p] });
    else if (tool === 'ARROW' || tool === 'MEASURE' || tool === 'CALIBRATE') setDraft({ ...draft, to: p });
    else {
      const [sx, sy] = draft.points![0];
      setDraft({ points: draft.points, x: Math.min(sx, p[0]), y: Math.min(sy, p[1]), w: Math.abs(p[0] - sx), h: Math.abs(p[1] - sy) });
    }
  }

  function up() {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (!draft) return;
    const d = draft;
    setDraft(null);
    if (tool === 'PEN' && (d.points?.length ?? 0) > 1) {
      // Thin the stroke: one point every few pixels is plenty.
      const pts = d.points!.filter((p, i, all) => i === 0 || i === all.length - 1 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 0.002);
      void save('PEN', { points: pts.length > 1 ? pts : d.points });
    } else if ((tool === 'ARROW' || tool === 'MEASURE') && d.from && d.to && Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]) > 0.005) {
      void save(tool, { from: d.from, to: d.to });
    } else if (tool === 'CALIBRATE' && d.from && d.to && Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]) > 0.005) {
      setCalibrating({ from: d.from, to: d.to, length: '' });
    } else if ((tool === 'RECTANGLE' || tool === 'CLOUD') && (d.w ?? 0) > 0.005 && (d.h ?? 0) > 0.005) {
      void save(tool, { x: d.x, y: d.y, w: d.w, h: d.h });
    }
  }

  function finishArea() {
    if (poly && poly.length >= 3) void save('AREA', { points: poly });
    setPoly(null);
    setHover(null);
  }

  // Enter closes an area being drawn.
  useEffect(() => {
    if (!poly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishArea();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function saveCalibration() {
    if (!calibrating) return;
    const metres = Number(calibrating.length.replace(',', '.'));
    if (!(metres > 0)) return;
    try {
      setCalibrations(
        await authedFetch<Calibration[]>(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/calibrations`, {
          method: 'PUT',
          body: { page, x1: calibrating.from[0], y1: calibrating.from[1], x2: calibrating.to[0], y2: calibrating.to[1], realLength: metres },
        }),
      );
      chooseTool('MEASURE');
    } catch (e) {
      setError(err(e, 'Could not set the scale'));
    }
  }

  async function patch(m: Markup, body: Record<string, unknown>) {
    try {
      const u = await authedFetch<Markup>(`/projects/${projectId}/markups/${m.id}`, { method: 'PATCH', body });
      setMarkups((all) => all.map((x) => (x.id === u.id ? u : x)));
    } catch (e) {
      setError(err(e, 'Could not save'));
    }
  }

  async function remove(m: Markup) {
    if (!window.confirm('Delete this markup?')) return;
    try {
      await authedFetch(`/projects/${projectId}/markups/${m.id}`, { method: 'DELETE' });
      setMarkups((all) => all.filter((x) => x.id !== m.id));
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  async function raiseIssue() {
    if (!issueFor) return;
    try {
      const u = await authedFetch<Markup>(`/projects/${projectId}/markups/${issueFor.id}/issue`, {
        method: 'POST',
        body: { title: issueFor.title, ownerId: issueFor.ownerId || undefined },
      });
      setMarkups((all) => all.map((x) => (x.id === u.id ? u : x)));
      setIssueFor(null);
    } catch (e) {
      setError(err(e, 'Could not raise the issue'));
    }
  }

  async function download() {
    setBusy(true);
    try {
      const url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/marked-up`, accessToken);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title} - marked up.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(err(e, 'Could not produce the marked-up drawing'));
    } finally {
      setBusy(false);
    }
  }

  const tag = (x: number, y: number, text: string, colour: string) => (
    <text x={x} y={y} textAnchor="middle" fontSize={12} fontWeight={700} fill={colour} style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 4 }}>
      {text}
    </text>
  );

  const shape = (m: { kind: Kind; geometry: Geometry; color: string; id?: string; text?: string | null }, faded = false) => {
    const g = m.geometry;
    const sw = m.id && m.id === selected ? 3.5 : 2;
    const common = { stroke: m.color, strokeWidth: sw, fill: 'none', opacity: faded ? 0.35 : 0.95, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (m.kind) {
      case 'PEN':
        return <polyline points={(g.points ?? []).map(([x, y]) => toScreen(x, y).join(',')).join(' ')} {...common} />;
      case 'RECTANGLE': {
        const [ax, ay] = toScreen(g.x!, g.y!);
        const [bx, by] = toScreen(g.x! + g.w!, g.y! + g.h!);
        return <rect x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} {...common} />;
      }
      case 'CLOUD': {
        const [ax, ay] = toScreen(g.x!, g.y!);
        const [bx, by] = toScreen(g.x! + g.w!, g.y! + g.h!);
        return <path d={cloudPath(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))} {...common} />;
      }
      case 'ARROW': {
        const [ax, ay] = toScreen(...g.from!);
        const [bx, by] = toScreen(...g.to!);
        const ang = Math.atan2(by - ay, bx - ax);
        const l = 12;
        const head = [ang + Math.PI - 0.45, ang + Math.PI + 0.45].map((a) => `${bx + l * Math.cos(a)},${by + l * Math.sin(a)}`);
        return (
          <g {...common}>
            <line x1={ax} y1={ay} x2={bx} y2={by} />
            <polyline points={`${head[0]} ${bx},${by} ${head[1]}`} />
          </g>
        );
      }
      case 'MEASURE': {
        if (!g.from || !g.to) return null;
        const [ax, ay] = toScreen(...g.from);
        const [bx, by] = toScreen(...g.to);
        const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
        const t = 6;
        const tick = (x: number, y: number) => <line x1={x + t * Math.cos(ang)} y1={y + t * Math.sin(ang)} x2={x - t * Math.cos(ang)} y2={y - t * Math.sin(ang)} />;
        const len = measureOf('MEASURE', g, dims.w, dims.h, scale);
        return (
          <g {...common}>
            <line x1={ax} y1={ay} x2={bx} y2={by} strokeDasharray="6 3" />
            {tick(ax, ay)}
            {tick(bx, by)}
            <g stroke="none">{tag((ax + bx) / 2, (ay + by) / 2 - 6, len === null ? 'set the scale' : fmtLen(len), m.color)}</g>
          </g>
        );
      }
      case 'AREA': {
        const pts = (g.points ?? []).map(([x, y]) => toScreen(x, y));
        if (pts.length < 3) return null;
        const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
        const cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
        const area = measureOf('AREA', g, dims.w, dims.h, scale);
        return (
          <g {...common}>
            <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={m.color} fillOpacity={0.12} />
            <g stroke="none">{tag(cx, cy, area === null ? 'set the scale' : fmtArea(area), m.color)}</g>
          </g>
        );
      }
      case 'STAMP': {
        if (g.x === undefined || g.y === undefined) return null;
        const [x, y] = toScreen(g.x, g.y);
        const words = (m.text ?? '').toUpperCase();
        const fs = 14;
        const w = words.length * fs * 0.66 + fs * 1.6;
        return (
          <g opacity={faded ? 0.35 : 0.9}>
            <rect x={x} y={y} width={w} height={fs * 2.2} fill="white" fillOpacity={0.85} stroke={m.color} strokeWidth={m.id === selected ? 3.5 : 2.5} rx={3} />
            <rect x={x + 3} y={y + 3} width={w - 6} height={fs * 2.2 - 6} fill="none" stroke={m.color} strokeWidth={0.8} rx={2} />
            <text x={x + fs * 0.8} y={y + fs * 1.45} fontSize={fs} fontWeight={800} fill={m.color} letterSpacing={0.5}>
              {words}
            </text>
          </g>
        );
      }
      default:
        return null;
    }
  };

  const mine = (m: Markup) => internal || m.author.id === user?.id;
  const owners = members.filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: memberName(m) }));

  return (
    // A portal to the page body: inside the app shell the header and the
    // chat button would sit on top of a full-screen viewer.
    createPortal(
      <div className="fixed inset-0 z-[80] flex flex-col bg-slate-100 dark:bg-slate-950" role="dialog" aria-modal="true" aria-label={`Mark up ${title}`}>
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="toolbar" aria-label="Markup tools">
            {TOOLS.map((t) => (
              <button
                key={t.kind}
                type="button"
                title={t.label}
                aria-label={t.label}
                aria-pressed={tool === t.kind}
                onClick={() => chooseTool(t.kind)}
                className={`flex h-9 w-9 items-center justify-center rounded-md ${tool === t.kind ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <t.icon size={16} />
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 shrink-0 rounded-full border-2 ${color === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            {tool === 'STAMP' && (
              <Select className={`${selectCls} ml-1 h-9 w-52 text-xs`} value={stamp} onChange={setStamp} options={STAMPS.map((x) => ({ value: x, label: x.charAt(0) + x.slice(1).toLowerCase() }))} aria-label="Which stamp" />
            )}
            {cad && cad.layers.length > 1 && (
              <button
                type="button"
                title="Layers"
                aria-label="Layers"
                aria-pressed={showLayers}
                onClick={() => setShowLayers((v) => !v)}
                className={`ml-1 flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium ${showLayers ? 'bg-slate-200 dark:bg-slate-700' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <Layers size={15} /> {cad.layers.length - hiddenLayers.length}/{cad.layers.length}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
            >
              <Plus size={16} />
            </button>
            {pages > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300"
                  onClick={() => goPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs tabular-nums text-slate-500">
                  {page}/{pages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= pages}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300"
                  onClick={() => goPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            <button type="button" className={secondaryBtn} disabled={busy} onClick={download}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">With markups</span>
            </button>
            <button
              type="button"
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {error && (
          <p role="alert" className="bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {(tool === 'MEASURE' || tool === 'AREA' || tool === 'CALIBRATE') && (
          <p className="border-b border-slate-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900 dark:border-slate-800 dark:bg-sky-950 dark:text-sky-200" role="status">
            {tool === 'CALIBRATE'
              ? 'Draw along a dimension you know - a dimensioned wall or the scale bar - then enter its real length.'
              : !scale
                ? 'This page has no scale yet: use “Set the scale” first, then measure.'
                : tool === 'MEASURE'
                  ? 'Drag from one point to another to measure.'
                  : 'Click each corner. Click the first corner again (or press Enter) to close the area.'}
            {scale && calibration && tool !== 'CALIBRATE' && <span className="ml-2 text-sky-700 dark:text-sky-400">Scale set from a {fmtLen(calibration.realLength)} line.</span>}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-4">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Opening the drawing…
              </p>
            )}
            <div className="relative mx-auto bg-white shadow" style={{ width: size.w || undefined, height: size.h || undefined }}>
              {pdf && <canvas ref={canvasRef} className="block" />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {image && <img src={image.url} alt={title} style={{ width: size.w, height: size.h }} className="block select-none" draggable={false} />}
              {cad && (
                <>
                  <style>{hiddenLayers.map((l) => `.cad-sheet g[data-layer="${CSS.escape(l)}"]{display:none}`).join('')}</style>
                  <div className="cad-sheet select-none" style={{ width: size.w, height: size.h }} aria-label={title} role="img" dangerouslySetInnerHTML={{ __html: cad.svg }} />
                </>
              )}
              {size.w > 0 && (
                <svg
                  className="absolute inset-0"
                  width={size.w}
                  height={size.h}
                  style={{ touchAction: tool === 'PAN' ? 'auto' : 'none', cursor: tool === 'PAN' ? 'grab' : 'crosshair' }}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  aria-label="Drawing"
                >
                  {onPage.map((m) => (
                    <g key={m.id} onClick={() => setSelected(m.id)}>
                      {shape(m, Boolean(m.resolvedAt))}
                    </g>
                  ))}
                  {draft && tool !== 'CALIBRATE' && shape({ kind: tool as Kind, geometry: draft, color })}
                  {(() => {
                    const line =
                      (draft && tool === 'CALIBRATE' ? draft : null) ??
                      (calibrating ? { from: calibrating.from, to: calibrating.to } : null) ??
                      (tool === 'CALIBRATE' && calibration ? { from: [calibration.x1, calibration.y1] as Pt, to: [calibration.x2, calibration.y2] as Pt } : null);
                    if (!line?.from || !line.to) return null;
                    const [ax, ay] = toScreen(...line.from);
                    const [bx, by] = toScreen(...line.to);
                    return (
                      <g stroke="#0284c7" strokeWidth={2.5}>
                        <line x1={ax} y1={ay} x2={bx} y2={by} strokeDasharray="2 4" />
                        <circle cx={ax} cy={ay} r={4} fill="#0284c7" />
                        <circle cx={bx} cy={by} r={4} fill="#0284c7" />
                        {!draft && !calibrating && calibration && <g stroke="none">{tag((ax + bx) / 2, (ay + by) / 2 - 8, `${fmtLen(calibration.realLength)} (current scale)`, '#0284c7')}</g>}
                      </g>
                    );
                  })()}
                  {poly && (
                    <g stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1}>
                      <polyline points={[...poly, ...(hover ? [hover] : [])].map(([x, y]) => toScreen(x, y).join(',')).join(' ')} />
                      {poly.map((p, i) => {
                        const [x, y] = toScreen(...p);
                        return <circle key={i} cx={x} cy={y} r={i === 0 ? 6 : 3.5} fill={i === 0 ? 'white' : color} fillOpacity={1} />;
                      })}
                    </g>
                  )}
                  {onPage
                    .filter((m) => m.kind === 'PIN' || m.kind === 'TEXT')
                    .map((m) => {
                      const [x, y] = toScreen(m.geometry.x!, m.geometry.y!);
                      return (
                        <g key={`n-${m.id}`} transform={`translate(${x},${y})`} opacity={m.resolvedAt ? 0.45 : 1} onClick={() => setSelected(m.id)} style={{ cursor: 'pointer' }}>
                          {m.kind === 'PIN' ? (
                            <path d="M0 0 C -9 -10 -9 -24 0 -24 C 9 -24 9 -10 0 0 Z" fill={m.color} stroke="white" strokeWidth={1.5} />
                          ) : (
                            <circle r={11} fill={m.color} stroke="white" strokeWidth={1.5} />
                          )}
                          <text y={m.kind === 'PIN' ? -12 : 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="white">
                            {numbers.get(m.id)}
                          </text>
                          {m.kind === 'TEXT' && m.text && (
                            <text x={16} y={4} fontSize={12} fill={m.color} style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3 }}>
                              {m.text.length > 60 ? `${m.text.slice(0, 60)}…` : m.text}
                            </text>
                          )}
                          {m.id === selected && <circle r={16} cy={m.kind === 'PIN' ? -12 : 0} fill="none" stroke={m.color} strokeDasharray="3 3" />}
                        </g>
                      );
                    })}
                </svg>
              )}
              {calibrating && (
                <div
                  className="absolute z-10 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  style={{ left: Math.max(0, Math.min(toScreen(...calibrating.to)[0], size.w - 260)), top: toScreen(...calibrating.to)[1] + 10 }}
                >
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">
                    Real length of that line (metres)
                    <input
                      autoFocus
                      inputMode="decimal"
                      className={`${inputCls} mt-1`}
                      placeholder="e.g. 6.4"
                      value={calibrating.length}
                      onChange={(e) => setCalibrating({ ...calibrating, length: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && saveCalibration()}
                    />
                  </label>
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <button type="button" className={secondaryBtn} onClick={() => setCalibrating(null)}>
                      Cancel
                    </button>
                    <button type="button" className={primaryBtn} disabled={!(Number(calibrating.length.replace(',', '.')) > 0)} onClick={saveCalibration}>
                      Set scale
                    </button>
                  </div>
                </div>
              )}
              {placing && (
                <div
                  className="absolute z-10 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  style={{ left: Math.min(toScreen(placing.x, placing.y)[0], size.w - 260), top: toScreen(placing.x, placing.y)[1] + 8 }}
                >
                  <textarea
                    autoFocus
                    rows={2}
                    className={`${inputCls} h-auto py-1.5`}
                    placeholder={placing.kind === 'PIN' ? 'What did you see on site?' : 'Note'}
                    value={placing.text}
                    onChange={(e) => setPlacing({ ...placing, text: e.target.value })}
                    aria-label={placing.kind === 'PIN' ? 'Pin note' : 'Note text'}
                  />
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <button type="button" className={secondaryBtn} onClick={() => setPlacing(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={!placing.text.trim()}
                      onClick={() => {
                        void save(placing.kind, { x: placing.x, y: placing.y }, placing.text.trim());
                        setPlacing(null);
                      }}
                    >
                      Place
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside
            className="max-h-[40vh] w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-3 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 dark:border-slate-800 dark:bg-slate-900"
            aria-label="Markups"
          >
            {cad && showLayers && (
              <div className="mb-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Layers</h3>
                  <button type="button" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setHiddenLayers(hiddenLayers.length ? [] : cad.layers)}>
                    {hiddenLayers.length ? 'Show all' : 'Hide all'}
                  </button>
                </div>
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {cad.layers.map((l) => (
                    <li key={l}>
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={!hiddenLayers.includes(l)}
                          onChange={(e) => setHiddenLayers(e.target.checked ? hiddenLayers.filter((x) => x !== l) : [...hiddenLayers, l])}
                        />
                        {l}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Markups ({markups.length})</h3>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
                Show dealt with
              </label>
            </div>
            {markups.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">Choose a tool above and draw on the sheet. Pins are for site observations and can become issues.</p>
            )}
            <ul className="mt-2 space-y-2">
              {markups
                .filter((m) => showResolved || !m.resolvedAt)
                .map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-2 text-xs ${m.id === selected ? 'border-emerald-500' : 'border-slate-200 dark:border-slate-700'} ${m.resolvedAt ? 'opacity-60' : ''}`}
                    onClick={() => {
                      setSelected(m.id);
                      if (m.page !== page) goPage(m.page);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {numbers.get(m.id) ? `${numbers.get(m.id)}. ` : ''}
                          {m.kind === 'MEASURE' || m.kind === 'AREA'
                            ? (() => {
                                const v = measureOf(m.kind, m.geometry, dims.w, dims.h, metresPerUnit(calibrations.find((c) => c.page === m.page), dims.w, dims.h));
                                return `${m.kind === 'MEASURE' ? 'Length' : 'Area'}: ${v === null ? 'scale not set' : m.kind === 'MEASURE' ? fmtLen(v) : fmtArea(v)}`;
                              })()
                            : m.kind === 'STAMP'
                              ? `Stamp: ${(m.text ?? '').toLowerCase()}`
                              : (m.text ?? TOOLS.find((t) => t.kind === m.kind)?.label)}
                        </p>
                        <p className="text-slate-500">
                          {m.author.fullName} · {fmtDay(m.createdAt)}
                          {pages > 1 && ` · page ${m.page}`}
                        </p>
                        {m.issue && <p className="text-red-700 dark:text-red-400">Issue: {m.issue.title}</p>}
                        {m.resolvedAt && <p className="text-emerald-700 dark:text-emerald-400">Dealt with{m.resolvedBy ? ` by ${m.resolvedBy.fullName}` : ''}</p>}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2 pl-5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        onClick={() => patch(m, { resolved: !m.resolvedAt })}
                      >
                        <Check size={11} /> {m.resolvedAt ? 'Reopen' : 'Dealt with'}
                      </button>
                      {m.kind === 'PIN' && !m.issue && (
                        <button
                          type="button"
                          className="font-medium text-red-700 hover:underline dark:text-red-400"
                          onClick={() => setIssueFor({ id: m.id, title: m.text ?? '', ownerId: '' })}
                        >
                          Raise an issue
                        </button>
                      )}
                      {mine(m) && (
                        <button type="button" aria-label="Delete markup" className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600" onClick={() => remove(m)}>
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
                    {issueFor?.id === m.id && (
                      <div className="mt-2 space-y-1.5 pl-5" onClick={(e) => e.stopPropagation()}>
                        <input
                          className={`${inputCls} h-8 text-xs`}
                          value={issueFor.title}
                          onChange={(e) => setIssueFor({ ...issueFor, title: e.target.value })}
                          aria-label="Issue title"
                        />
                        <Select
                          className={`${selectCls} h-8 w-full text-xs`}
                          value={issueFor.ownerId}
                          onChange={(v) => setIssueFor({ ...issueFor, ownerId: v })}
                          options={[{ value: '', label: 'Owner…' }, ...owners]}
                          aria-label="Issue owner"
                        />
                        <div className="flex gap-1.5">
                          <button type="button" className={primaryBtn} disabled={!issueFor.title.trim()} onClick={raiseIssue}>
                            Raise issue
                          </button>
                          <button type="button" className={secondaryBtn} onClick={() => setIssueFor(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </aside>
        </div>
      </div>,
      document.body,
    )
  );
}
