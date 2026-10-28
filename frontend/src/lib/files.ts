// File features chosen from OpenConstructionERP (26 Oct 2026): tags,
// version restore, full-text search, distribution lists, the recycle bin.
import { apiFetchBlobUrl } from './api-client';

export interface DocTag {
  id: string;
  name: string;
  color: string;
  count?: number;
}

export interface SearchHit {
  documentId: string;
  name: string;
  drawingNumber: string | null;
  projectId: string;
  projectName: string;
  revisionId: string | null;
  revisionNumber: string | null;
  latest: boolean;
  matchedName: boolean;
  pages: { page: number; snippet: string; source: 'PDF' | 'OCR' | string }[];
}

export interface SearchResult {
  query: string;
  results: SearchHit[];
  stillReading?: number;
}

export interface DistributionList {
  id: string;
  name: string;
  description: string | null;
  members: { projectMember: { id: string; role: string; externalName: string | null; externalCompany: string | null; user: { fullName: string } | null; contractor: { name: string } | null } }[];
}

export const TAG_COLOURS = ['#64748b', '#0f766e', '#15803d', '#b45309', '#b91c1c', '#7c3aed', '#1d4ed8', '#be185d'];

export function memberName(m: DistributionList['members'][number]['projectMember']) {
  return m.user?.fullName ?? m.externalName ?? m.contractor?.name ?? m.externalCompany ?? 'Unnamed';
}

/** Fetch a file behind auth and save it under the given name. */
export async function downloadFile(path: string, accessToken: string | null, filename: string) {
  const url = await apiFetchBlobUrl(path, accessToken);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
