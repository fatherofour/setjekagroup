const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  // For file uploads. When set, `body` is ignored and no Content-Type is
  // sent — the browser fills in the multipart boundary itself.
  formData?: FormData;
  accessToken?: string | null;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.formData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message = payload?.message ?? res.statusText;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// For downloading a file behind auth (a plain <a href> can't carry the
// Authorization header) — fetches the bytes and hands back an object URL
// the caller is responsible for revoking after use.
export async function apiFetchBlobUrl(path: string, accessToken?: string | null): Promise<string> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, payload?.message ?? res.statusText);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
