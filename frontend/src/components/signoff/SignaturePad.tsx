'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Dancing_Script } from 'next/font/google';
import { CheckCircle2, Eraser, PenLine, Type, Upload, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetchBlobUrl } from '@/lib/api-client';
import type { SignatureInput, SignatureMethod } from '@/lib/signoff';

// The handwriting style for a typed signature (App Review, 17 Oct 2026).
const handwriting = Dancing_Script({ subsets: ['latin'], weight: '600', display: 'swap' });

type Mode = 'SAVED' | SignatureMethod;

const INK = '#0b2a1f';
const W = 600;
const H = 180;

/** Crops a canvas to its ink, with a small margin, and returns a PNG. */
function trimmedPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 8;
  const out = document.createElement('canvas');
  out.width = Math.min(width, maxX - minX + 1 + pad * 2);
  out.height = Math.min(height, maxY - minY + 1 + pad * 2);
  out.getContext('2d')!.drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** An uploaded signature: scaled down, near-white background made
 * transparent so it sits cleanly on a drawing, then trimmed. */
async function fromUpload(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('unreadable'));
      i.src = url;
    });
    const scale = Math.min(1, 900 / img.naturalWidth, 300 / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < px.data.length; i += 4) {
      const light = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3;
      if (light > 225) px.data[i + 3] = 0;
    }
    ctx.putImageData(px, 0, 0);
    return trimmedPng(c);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** How the approver signs: draw it, type their name in a handwriting
 * style, upload an image of their signature, reuse the one they saved, or
 * (as an option) approve by acceptance alone. Reports a SignatureInput, or
 * null while nothing usable has been given. */
export function SignaturePad({ onChange, allowAcceptOnly = true }: { onChange: (s: SignatureInput | null) => void; allowAcceptOnly?: boolean }) {
  const { authedFetch, accessToken, user } = useAuth();
  const [saved, setSaved] = useState<{ method: SignatureMethod } | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('DRAWN');
  const [typed, setTyped] = useState(user?.fullName ?? '');
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saveForNextTime, setSaveForNextTime] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const typedCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    authedFetch<{ method: SignatureMethod } | null>('/me/signature')
      .then((s) => {
        if (!s) return;
        setSaved(s);
        setMode('SAVED');
        return apiFetchBlobUrl('/me/signature/image', accessToken).then(setSavedUrl);
      })
      .catch(() => {});
  }, [authedFetch, accessToken]);

  // Draw the typed name in the handwriting font whenever it changes.
  useEffect(() => {
    if (mode !== 'TYPED') return;
    const c = typedCanvas.current;
    if (!c) return;
    const family = handwriting.style.fontFamily;
    let cancelled = false;
    document.fonts.load(`64px ${family}`).finally(() => {
      if (cancelled) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      let size = 72;
      ctx.font = `600 ${size}px ${family}`;
      while (ctx.measureText(typed).width > c.width - 40 && size > 28) {
        size -= 4;
        ctx.font = `600 ${size}px ${family}`;
      }
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(typed, 20, c.height / 2);
    });
    return () => {
      cancelled = true;
    };
  }, [typed, mode]);

  // Report the current signature upward.
  useEffect(() => {
    if (mode === 'ACCEPTED') return onChange({ method: 'ACCEPTED' });
    if (mode === 'SAVED') return onChange(saved ? { method: saved.method, useSaved: true } : null);
    if (mode === 'UPLOADED') return onChange(uploaded ? { method: 'UPLOADED', image: uploaded, saveForNextTime } : null);
    if (mode === 'TYPED') {
      if (!typed.trim()) return onChange(null);
      const t = setTimeout(() => {
        const img = typedCanvas.current ? trimmedPng(typedCanvas.current) : null;
        onChange(img ? { method: 'TYPED', image: img, saveForNextTime } : null);
      }, 250);
      return () => clearTimeout(t);
    }
    onChange(hasInk && canvas.current ? { method: 'DRAWN', image: trimmedPng(canvas.current) ?? undefined, saveForNextTime } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, uploaded, typed, hasInk, saveForNextTime, saved]);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    // Re-report so the image includes the latest stroke.
    if (canvas.current) onChange({ method: 'DRAWN', image: trimmedPng(canvas.current) ?? undefined, saveForNextTime });
  }
  function clear() {
    canvas.current?.getContext('2d')?.clearRect(0, 0, W, H);
    setHasInk(false);
  }

  const tabs: { value: Mode; label: string; icon: typeof PenLine; show: boolean }[] = [
    { value: 'SAVED', label: 'My saved signature', icon: CheckCircle2, show: Boolean(saved) },
    { value: 'DRAWN', label: 'Draw', icon: PenLine, show: true },
    { value: 'TYPED', label: 'Type', icon: Type, show: true },
    { value: 'UPLOADED', label: 'Upload', icon: Upload, show: true },
    { value: 'ACCEPTED', label: 'Accept without signing', icon: UserCheck, show: allowAcceptOnly },
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Your signature</legend>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="How to sign">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={mode === t.value}
              onClick={() => setMode(t.value)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                mode === t.value
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
      </div>

      {mode === 'SAVED' && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL */}
          {savedUrl ? <img src={savedUrl} alt="Your saved signature" className="max-h-24 dark:invert" /> : <p className="text-sm text-slate-400">Loading…</p>}
        </div>
      )}

      {mode === 'DRAWN' && (
        <div>
          <canvas
            ref={canvas}
            width={W}
            height={H}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            aria-label="Sign here with your finger, pen or mouse"
            className="h-36 w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white dark:border-slate-600"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Sign in the box with your finger, a pen or the mouse.</span>
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Eraser size={12} /> Clear
            </button>
          </div>
        </div>
      )}

      {mode === 'TYPED' && (
        <div className="space-y-2">
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            Your full name
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <canvas ref={typedCanvas} width={W} height={H} aria-label="Your typed signature" className="h-28 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
        </div>
      )}

      {mode === 'UPLOADED' && (
        <div className="space-y-2">
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            <Upload size={15} /> Choose a photo or scan of your signature
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploadError(null);
                const img = await fromUpload(f);
                if (img) setUploaded(img);
                else setUploadError('That image could not be read. Try a PNG or JPEG of your signature on white paper.');
                e.target.value = '';
              }}
            />
          </label>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          {uploaded && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL preview */}
              <img src={uploaded} alt="Your uploaded signature" className="max-h-24" />
            </div>
          )}
        </div>
      )}

      {mode === 'ACCEPTED' && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          You&apos;ll approve by acceptance only. Your name, the date and time are recorded and shown on the signed copy, without a signature image.
        </p>
      )}

      {(mode === 'DRAWN' || mode === 'TYPED' || mode === 'UPLOADED') && (
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={saveForNextTime} onChange={(e) => setSaveForNextTime(e.target.checked)} />
          Save this signature for next time
        </label>
      )}
    </fieldset>
  );
}
