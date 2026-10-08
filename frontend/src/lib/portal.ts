import type { AuthUser } from './auth-context';

/** A client login: an external account tied to a client organisation. */
export function isClientUser(user: Pick<AuthUser, 'accountType' | 'role' | 'clientId'> | null | undefined) {
  return Boolean(user && user.accountType !== 'INTERNAL' && user.role !== 'ADMIN' && user.clientId);
}

/** Clients work in their portal rather than the full project workspace, so
 * a link into a project's tabs opens the client's portal page for it. */
export function clientLink(link: string, user: Pick<AuthUser, 'accountType' | 'role' | 'clientId'> | null | undefined) {
  if (!isClientUser(user)) return link;
  const m = link.match(/^\/projects\/([0-9a-f-]{36})/);
  if (!m) return link;
  // Land on the matching part of the portal page where there is one.
  const tab = new URLSearchParams(link.split('?')[1] ?? '').get('tab');
  const anchor = tab === 'photos' ? '#photos' : tab === 'documents' ? '#documents' : tab === 'meetings' ? '#meetings' : '';
  return `/portal/projects/${m[1]}${anchor}`;
}
