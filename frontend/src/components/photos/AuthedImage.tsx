'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetchBlobUrl } from '@/lib/api-client';

// Photos sit behind sign-in, so a plain <img src> can't fetch them. Each one
// is fetched with the access token once it scrolls near the screen, and kept
// for the session so moving between filters doesn't download it again.
const cache = new Map<string, string>();

export function AuthedImage({ path, alt, className, eager = false }: { path: string; alt: string; className?: string; eager?: boolean }) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(() => cache.get(path) ?? null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache.has(path) || !accessToken) return;
    let cancelled = false;
    const load = () => {
      apiFetchBlobUrl(path, accessToken)
        .then((u) => {
          cache.set(path, u);
          if (!cancelled) setUrl(u);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    if (eager || typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '300px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [path, accessToken, eager]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800 ${className ?? ''}`} role="img" aria-label={`${alt} (can't be shown)`}>
        <ImageOff size={20} />
      </div>
    );
  }
  if (!url) return <div ref={ref} className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${className ?? ''}`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, which next/image can't optimise
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
