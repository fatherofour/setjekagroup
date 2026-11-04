'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';

// Project screens the client never sees: the site records (Meeting 3:
// Setjeka controls what the client sees).
const CLIENT_HIDDEN = new Set(['inspections', 'ncrs', 'tests', 'hse', 'diary', 'lookahead', 'plant', 'hidden', 'interfaces', 'measure', 'punch', 'bim']);

/** What the signed-in person may open on a project: shared by the project
 * page's screens and the sidebar, so both offer the same set. */
export function useProjectAccess(projectId: string | null) {
  const { authedFetch, user } = useAuth();
  const isExternal = user?.accountType === 'EXTERNAL';
  // An outside party's role on this project: a client may sign in through a
  // client organisation or simply be on the team as the client.
  const [mine, setMine] = useState<{ projectId: string; roles: string[] } | null>(null);
  useEffect(() => {
    if (!projectId || !isExternal || !user) return;
    authedFetch<{ userId: string | null; role: string }[]>(`/projects/${projectId}/members`)
      .then((m) => setMine({ projectId, roles: m.filter((x) => x.userId === user.id).map((x) => x.role) }))
      .catch(() => {});
  }, [authedFetch, projectId, isExternal, user]);
  const here = Boolean(projectId) && mine?.projectId === projectId;
  const clientByRole = here && mine!.roles.includes('CLIENT');
  const qsByRole = here && mine!.roles.includes('QUANTITY_SURVEYOR');
  // Budgets, variations and fees: Setjeka staff, the QS and the client.
  const seesCommercial = !isExternal || user?.role === 'ADMIN' || Boolean(user?.clientId) || clientByRole || qsByRole;
  const isClient = isExternal && (Boolean(user?.clientId) || clientByRole);
  // Until an outside party's role here is known, client-hidden screens wait.
  const roleKnown = !isExternal || Boolean(user?.clientId) || here;
  /** Whether a project screen (a workspace tab value) is offered. */
  const canOpen = (tab: string) => (tab !== 'commercial' || seesCommercial) && (!CLIENT_HIDDEN.has(tab) || !isClient);
  return { isExternal, isClient, seesCommercial, roleKnown, canOpen };
}
