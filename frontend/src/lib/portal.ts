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
  return m ? `/portal/projects/${m[1]}` : link;
}
