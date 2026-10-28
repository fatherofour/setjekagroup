'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from 'lucide-react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { useAuth } from '@/lib/auth-context';
import { apiFetchBlobUrl } from '@/lib/api-client';

export interface PlanPin {
  id: string;
  page: number;
  x: number;
  y: number;
  label: string;
  colour: string;
  title?: string;
}

/** A drawing sheet - PDF, image or CAD (drawn on the server) - with numbered
 * pins on it. Coordinates are fractions of the unrotated page, as markups
 * use. With `onPick`, a click on the sheet hands back where. */
export function PlanView({
  projectId,
  documentId,
  revisionId,
  filename,
  pins,
  selected,
  onSelect,
  onPick,
  height = 520,
}: {
  projectId: string;
  documentId: string;
  revisionId: string;
  filename: string;
  pins: PlanPin[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onPick?: (p: { page: number; x: number; y: number }) => void;
  height?: number;
}) {
  const { accessToken } = useAuth();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [flat, setFlat] = useState<{ url: string; w: number; h: number } | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    // A different sheet is a new PlanView (keyed by revision), so state
    // starts fresh.
    (async () => {
      try {
        const cad = /\.(dwg|dxf)$/i.test(filename);
        url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/${cad ? 'drawing.svg' : 'file'}`, accessToken);
        const blob = await fetch(url).then((r) => r.blob());
        if (cad || blob.type.startsWith('image/')) {
          const img = new Image();
          img.src = url;
          await img.decode();
          if (!cancelled) setFlat({ url, w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 });
        } else {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
          const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
          if (!cancelled) setPdf(doc);
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 1000);
    };
  }, [projectId, documentId, revisionId, filename, accessToken]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !boxRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const fit = Math.max(0.1, (boxRef.current!.clientWidth - 16) / base.width);
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
    if (!flat || !boxRef.current) return;
    const fit = Math.max(0.05, (boxRef.current.clientWidth - 16) / flat.w);
    setSize({ w: flat.w * fit * zoom, h: flat.h * fit * zoom });
  }, [flat, zoom]);

  const toScreen = useCallback(
    (x: number, y: number): [number, number] => {
      if (viewport) {
        const [x0, y0, x1, y1] = viewport.viewBox;
        const [sx, sy] = viewport.convertToViewportPoint(x0 + x * (x1 - x0), y1 - y * (y1 - y0));
        return [sx, sy];
      }
      return [x * size.w, y * size.h];
    },
    [viewport, size],
  );

  function pick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    let x = sx / size.w;
    let y = sy / size.h;
    if (viewport) {
      const [x0, y0, x1, y1] = viewport.viewBox;
      const [px, py] = viewport.convertToPdfPoint(sx, sy);
      x = (px - x0) / (x1 - x0);
      y = (y1 - py) / (y1 - y0);
    }
    onPick({ page, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }

  const pages = pdf?.numPages ?? 1;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1 dark:border-slate-800">
        <button type="button" aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
          <Minus size={15} />
        </button>
        <span className="w-11 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setZoom((z) => Math.min(6, z * 1.25))}>
          <Plus size={15} />
        </button>
        {pages > 1 && (
          <span className="ml-2 flex items-center gap-1 text-xs text-slate-500">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">
              <ChevronLeft size={14} />
            </button>
            {page}/{pages}
            <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">
              <ChevronRight size={14} />
            </button>
          </span>
        )}
        {onPick && <span className="ml-auto text-xs font-medium text-emerald-700 dark:text-emerald-400">Click the sheet to place the item</span>}
      </div>
      <div ref={boxRef} className="overflow-auto bg-slate-100 p-2 dark:bg-slate-950" style={{ height }}>
        {state === 'loading' && (
          <p className="flex items-center gap-2 p-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Opening the drawing…
          </p>
        )}
        {state === 'error' && <p className="p-2 text-sm text-red-600">This drawing could not be shown.</p>}
        <div className="relative mx-auto bg-white shadow" style={{ width: size.w || undefined, height: size.h || undefined, cursor: onPick ? 'crosshair' : 'default' }} onClick={pick}>
          {pdf && <canvas ref={canvasRef} className="block" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {flat && <img src={flat.url} alt="Drawing" style={{ width: size.w, height: size.h }} className="block select-none" draggable={false} />}
          {size.w > 0 &&
            pins
              .filter((p) => p.page === page)
              .map((p) => {
                const [x, y] = toScreen(p.x, p.y);
                const on = p.id === selected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.title}
                    aria-label={p.title ?? p.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(p.id);
                    }}
                    className={`absolute flex min-w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none px-1.5 py-0.5 text-[10px] font-bold text-white shadow ring-2 ${on ? 'z-10 scale-125 ring-slate-900 dark:ring-white' : 'ring-white'}`}
                    style={{ left: x, top: y, background: p.colour }}
                  >
                    {p.label}
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}
