export interface SitePhoto {
  id: string;
  projectId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  thumbFilename: string | null;
  caption: string | null;
  takenAt: string;
  latitude: number | null;
  longitude: number | null;
  locationNote: string | null;
  tags: string[];
  clientVisible: boolean;
  projectNodeId: string | null;
  scheduleActivityId: string | null;
  taskId: string | null;
  issueId: string | null;
  uploadedById: string;
  uploadedBy: { id: string; fullName: string };
  projectNode: { id: string; name: string } | null;
  scheduleActivity: { id: string; name: string } | null;
  task: { id: string; title: string } | null;
  issue: { id: string; title: string } | null;
  noteCount: number;
  createdAt: string;
}

export interface PhotoLinkOptions {
  issues: { value: string; label: string }[];
  tasks: { value: string; label: string }[];
  activities: { value: string; label: string }[];
  nodes: { value: string; label: string }[];
}

// Phone photos are 3-12 MB; on a site connection that's slow and costly.
// The long edge is brought down to a size that still reads well full-screen
// and in a report, and a small preview is made for the gallery.
const FULL_EDGE = 2560;
const THUMB_EDGE = 480;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot read that image'));
    };
    img.src = url;
  });
}

function scaleTo(img: HTMLImageElement, edge: number, quality: number): Promise<Blob | null> {
  const ratio = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export interface PreparedPhoto {
  file: File;
  thumb: Blob | null;
  takenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
}

/** Read the camera's own date and GPS, then shrink the photo and make a
 * preview. If the browser can't decode the format (HEIC outside Safari),
 * the original goes up untouched with no preview. */
export async function preparePhoto(original: File): Promise<PreparedPhoto> {
  let takenAt: Date | null = null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  try {
    const exifr = (await import('exifr')).default;
    const tags = await exifr.parse(original, {
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'],
      gps: true,
    });
    const when = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (when instanceof Date && !Number.isNaN(when.getTime())) takenAt = when;
    if (typeof tags?.latitude === 'number' && typeof tags?.longitude === 'number') {
      latitude = tags.latitude;
      longitude = tags.longitude;
    }
  } catch {
    // No camera data - fall back to the file's own date below.
  }
  if (!takenAt && original.lastModified) takenAt = new Date(original.lastModified);

  try {
    const img = await loadImage(original);
    const [full, thumb] = await Promise.all([scaleTo(img, FULL_EDGE, 0.85), scaleTo(img, THUMB_EDGE, 0.75)]);
    // Keep the original when it's already smaller than the re-encoded one
    // (a small PNG screenshot, say).
    const file =
      full && full.size < original.size
        ? new File([full], original.name.replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
          })
        : original;
    return { file, thumb, takenAt, latitude, longitude };
  } catch {
    return { file: original, thumb: null, takenAt, latitude, longitude };
  }
}

/** The device's current position, if the person allows it - for photos
 * taken just now that carry no GPS of their own. */
export function currentPosition(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function mapLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
